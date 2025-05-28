// Note: do not import Parse dependency. see https://github.com/parse-community/parse-server/issues/6467
/* global Parse */

import crypto from "node:crypto";

export interface AuthData {
  email: string;
  otp: string;
}

export interface OtpOptions {
  otpValidityInMs: number;
  maxAttempts: number;
  sendEmail: (email: string, otp: string) => Promise<void>;
}

export interface OtpAdapterOptions {
  options: OtpOptions;
  module: OtpAdapter;
}

const OTP_TABLE_NAME = "OTP";
export const OTP_TABLE_SCHEMA = {
  className: OTP_TABLE_NAME,
  fields: {
    objectId: { type: "String" },
    createdAt: { type: "Date" },
    updatedAt: { type: "Date" },
    ACL: { type: "ACL" },
    email: { type: "String" },
    otp: { type: "String" },
    expiresAt: { type: "Date" },
    attempts: { type: "Number" },
  },
  classLevelPermissions: {
    find: {},
    count: {},
    get: {},
    create: {},
    update: {},
    delete: {},
    addField: {},
    protectedFields: {},
  },
  indexes: { _id_: { _id: 1 }, email_idx: { email: 1 } },
};
export class OtpAdapter {
  constructor() {}

  async validateAuthData(
    authData: AuthData,
    { options }: OtpAdapterOptions,
    request: Parse.Cloud.TriggerRequest
  ) {
    const { email, otp } = authData;
    const isMaster = !!request.master;

    // We do this to let update on cloud code with master key
    if (!isMaster) {
      const query = new Parse.Query(OTP_TABLE_NAME);
      query.equalTo("email", email);
      query.descending("createdAt");

      const otpObject = await query.first({ useMasterKey: true });

      if (!otpObject) {
        throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, "OTP not found");
      }

      if (new Date() > otpObject.get("expiresAt")) {
        await otpObject.destroy({ useMasterKey: true });
        throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN, "OTP expired");
      }

      if (otpObject.get("otp") !== otp) {
        const attempts = (otpObject.get("attempts") || 0) + 1;
        otpObject.set("attempts", attempts);

        if (attempts >= options.maxAttempts) {
          await otpObject.destroy({ useMasterKey: true });
          throw new Parse.Error(
            Parse.Error.OBJECT_NOT_FOUND,
            "Max attempts reached. OTP invalidated."
          );
        } else {
          await otpObject.save(null, { useMasterKey: true });
          throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, "Invalid OTP");
        }
      }

      // OTP is valid, remove it from storage
      await otpObject.destroy({ useMasterKey: true });
    }

    // Return true to indicate successful authentication
    return true;
  }

  async challenge(
    challengeData: { email: string },
    authData: unknown,
    { options }: OtpAdapterOptions
  ) {
    const { email } = challengeData;
    const otp = crypto.randomInt(100000, 999999).toString();
    const expiresAt = getExpirationTime(options.otpValidityInMs);

    // Query for existing OTP for this email
    const query = new Parse.Query(OTP_TABLE_NAME);
    query.equalTo("email", email);
    let otpObject = await query.first({ useMasterKey: true });

    if (otpObject) {
      // Update existing OTP
      otpObject.set("otp", otp);
      otpObject.set("expiresAt", expiresAt);
    } else {
      // Create new OTP if not exists
      otpObject = new Parse.Object(OTP_TABLE_NAME);
      otpObject.set("email", email);
      otpObject.set("otp", otp);
      otpObject.set("expiresAt", expiresAt);
    }

    await otpObject.save(null, { useMasterKey: true });

    // Use the sendEmail function
    await options.sendEmail(email, otp);

    // Return challenge data
    return { ok: true };
  }

  validateAppId() {
    return Promise.resolve();
  }

  validateOptions(options: OtpAdapterOptions): void {
    const { options: otpOptions } = options;
    if (!otpOptions) {
      throw new Error("Options object is required");
    }

    // Validate OtpOptions fields
    if (
      typeof otpOptions.otpValidityInMs !== "number" ||
      otpOptions.otpValidityInMs <= 0
    ) {
      throw new Error("Invalid or missing otpValidityInMs");
    }

    if (typeof otpOptions.maxAttempts !== "number" || otpOptions.maxAttempts <= 0) {
      throw new Error("Invalid or missing maxAttempts");
    }

    if (typeof otpOptions.sendEmail !== "function") {
      throw new Error("Invalid or missing sendEmail function");
    }

    // Validate that module is an instance of OtpAdapter
    if (!(options.module instanceof OtpAdapter)) {
      throw new Error("Module must be an instance of OtpAdapter");
    }
  }
}

function getExpirationTime(otpValidityInMs: number) {
  const currentTime = new Date();
  const expirationTime = new Date(currentTime.getTime() + otpValidityInMs);
  return expirationTime;
}

export async function setupOtpTable(): Promise<void> {
  try {
    const schema = new Parse.Schema(OTP_TABLE_NAME);

    try {
      await schema.get();
      console.log(`OTP-AUTH-ADAPTER: Schema for class ${OTP_TABLE_NAME} already exists.`);
    } catch (getSchemaError: any) {
      console.log(
        `OTP-AUTH-ADAPTER: Schema for class ${OTP_TABLE_NAME} not found. Creating...`
      );

      schema.addString("email");
      schema.addString("otp");
      schema.addDate("expiresAt");
      schema.addNumber("attempts");
      schema.addIndex("email_idx", { email: 1 });
      schema.setCLP({});

      await schema.save();
      console.log(
        `OTP-AUTH-ADAPTER: Schema for class ${OTP_TABLE_NAME} created successfully.`
      );
    }
  } catch (err: any) {
    console.error(
      "OTP-AUTH-ADAPTER: Error during schema setup for",
      OTP_TABLE_NAME,
      ":",
      err.message || err
    );
  }
}

export function initializeOtpAdapter(options: OtpOptions) {
  return {
    module: new OtpAdapter(),
    options,
  };
}

export function updateAuthDataAfterSave(
  request: Parse.Cloud.AfterSaveRequest<Parse.User<Parse.Attributes>>
) {
  const user = request.object;
  const authData = user.toJSON().authData;
  const email = user.getEmail();

  if (email && authData.otp.id !== email) {
    authData.otp.id = email;
    authData.otp.email = email;
    user.save({ authData }, { useMasterKey: true });
  }
}
