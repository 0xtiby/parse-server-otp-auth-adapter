// Note: do not import Parse dependency. see https://github.com/parse-community/parse-server/issues/6467
/* global Parse */

import crypto from "node:crypto";
import Config from "parse-server/lib/Config"; //ts-ignore

export interface AuthData {
  email: string;
  otp: string;
}

export interface OtpOptions {
  otpValidityInMs: number;
  applicationId: string;
  mountPath: string;
  maxAttempts: number;
  sendEmail: (email: string, otp: string) => Promise<void>;
}

export interface OtpAdapterOptions {
  options: OtpOptions;
  module: OtpAdapter;
}

const OTP_TABLE_NAME = "OTP";

export class OtpAdapter {
  constructor(applicationId: string, mountPath: string) {
    setTimeout(() => {
      setupOtpTable(applicationId, mountPath)
        .then(() => {
          console.log("OTP-AUTH-ADAPTER", "OTP table setup complete");
        })
        .catch((err) => {
          console.log("OTP-AUTH-ADAPTER", err);
        });
    }, 3000);
  }

  async validateAuthData(authData: AuthData, { options }: OtpAdapterOptions) {
    const { email, otp } = authData;

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

    if (!otpOptions.applicationId || typeof otpOptions.applicationId !== "string") {
      throw new Error("Invalid or missing applicationId");
    }

    if (!otpOptions.mountPath || typeof otpOptions.mountPath !== "string") {
      throw new Error("Invalid or missing mountPath");
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

async function setupOtpTable(applicationId: string, mountPath: string) {
  const config = Config.get(applicationId, mountPath);
  const schema = await config.database.loadSchema();
  console.log("OTP-AUTH-ADAPTER", "Creating OTP class ...");
  try {
    await schema.addClassIfNotExists(OTP_TABLE_NAME, {
      email: { type: "String" },
      otp: { type: "String" },
      expiresAt: { type: "Date" },
      attempts: { type: "Number" },
    });
    console.log("OTP-AUTH-ADAPTER", "OTP class created, setting CLP ...");

    await schema.setPermissions(OTP_TABLE_NAME, {
      get: {},
      find: {},
      create: {},
      update: {},
      delete: {},
      addField: {},
    });
    console.log("OTP-AUTH-ADAPTER", "OTP CLP set");
  } catch (err) {
    if (err instanceof Error) {
      console.log("OTP-AUTH-ADAPTER", err.message);
    } else {
      console.log(
        "OTP-AUTH-ADAPTER",
        "An error occurred, but it could not be interpreted as an Error object."
      );
    }
  }
}

export function initializeOtpAdapter(options: OtpOptions) {
  return {
    module: new OtpAdapter(options.applicationId, options.mountPath),
    options,
  };
}
