# OTP Auth Adapter for Parse Server

The OTP Auth Adapter integrates seamlessly with Parse Server to enable One-Time Password (OTP) based authentication. This adapter facilitates secure user authentication using email-based OTP verification.

## Features

- **Email-based OTP Authentication**: Allow users to sign up and log in using their email addresses and one-time passwords.
- **Customizable OTP Validity**: Set custom expiration times for OTPs.
- **Max Attempts Limit**: Configurable maximum number of OTP entry attempts to prevent brute-force attacks.
- **Custom Email Sending**: Integrate with your preferred email service to send OTPs.

## Installation

To install the OTP Auth Adapter, add it to your Parse Server project via npm:

```bash
npm install parse-server-otp-auth-adapter
```

## Configuration

To use the OTP Auth Adapter in your Parse Server, configure it in the authentication section of your Parse Server options.

- **otpValidityInMs**: The validity duration of the OTP in milliseconds. Example: `300000` (which is equivalent to 5 minutes).
- **applicationId**: The application ID for which the adapter is configured, typically the Parse Server application ID. Example: `"YOUR_APP_ID"`.
- **mountPath**: The path where the Parse Server is mounted. Example: `"/parse"`.
- **maxAttempts**: The maximum number of OTP entry attempts allowed before invalidation. Example: `3`.
- **sendEmail**: A function that handles sending the OTP to the user's email. You need to implement this function to integrate with your email service.

```ts
const { initializeOtpAdapter } = require("parse-server-otp-auth-adapter");

const otpOptions = {
  otpValidityInMs: 300000, // 5 minutes
  applicationId: "YOUR_APP_ID",
  mountPath: "/parse",
  maxAttempts: 3,
  sendEmail: async (email, otp) => {
    // Implement your email sending logic here
    // For example:
    // await sendEmailWithYourService(email, `Your OTP is: ${otp}`);
  },
};

const otpAdapter = initializeOtpAdapter(otpOptions);

const api = new ParseServer({
  appId: "YOUR_APP_ID",
  masterKey: "YOUR_MASTER_KEY",
  serverURL: "http://localhost:1337/parse",
  auth: {
    otp: otpAdapter,
  },
});
```

## Usage

This section explains how to integrate the OTP Auth Adapter with your client-side application. The example below shows the complete process from requesting an OTP to authenticating the user via Parse Server.

```ts
const login = async () => {
  const parseUrl = "http://localhost:5001/parse";
  const appId = "yourAppId";
  const email = "user@example.com";

  // 1. Request OTP
  await fetch(`${parseUrl}/challenge`, {
    method: "POST",
    headers: {
      "X-Parse-Application-Id": appId,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      challengeData: {
        otp: {
          email,
        },
      },
    }),
  });

  // 2. User receives OTP via email

  // 3. Authenticate with Parse using the received OTP
  const otp = "123456"; // OTP entered by the user
  const authData = {
    email,
    otp,
  };

  const user = new Parse.User();
  user.set("username", email);
  await user.linkWith("otp", { authData });
};
```

## OTP Table

The OTP Auth Adapter requires an `OTP` table in your Parse Server database to store OTP data securely. This table includes the following fields:

- **email**: The email address associated with the OTP.
- **otp**: The generated one-time password.
- **expiresAt**: The expiration timestamp for the OTP.
- **attempts**: The number of attempts made to verify this OTP.

### Manual Table Setup

You **must** manually set up the required `OTP` table after initializing your Parse Server instance. The adapter exports a function `setupOtpTable` for this purpose. This function requires the Parse Server configuration object for the specific application.

You typically call `setupOtpTable` after your `ParseServer` instance has been created or started. You need to provide the configuration object obtained via `Config.get()`.

Here's an example within an async function that sets up an Express app and Parse Server:

```typescript
import express, { type Express, json } from "express";
import ParseServer from "parse-server";
import Config from "parse-server/lib/Config";
import { setupOtpTable } from "parse-server-otp-auth-adapter";
export const createServer = async (): Promise<Express> => {
  const app = express();
  const server = new ParseServer(parseConfig);

  await server.start();

  try {
    const config = Config.get(parseConfig.appId, parseConfig.mountPath);
    await setupOtpTable(config);
    console.log("OTP table setup successfully.");
  } catch (error) {
    console.error("Failed to setup OTP table:", error);
  }

  app.use(parseConfig.mountPath, server.app);

  return app;
};
```

This function creates the `OTP` class with the necessary fields and sets appropriate Class-Level Permissions (CLP) to restrict direct client access, ensuring OTP management is handled securely by the server.

For advanced users or for manual schema management, the required schema definition is also exported as `OTP_TABLE_SCHEMA`.

## Cleanup Job for Expired OTPs

To maintain the OTP table clean and remove expired entries, you can set up a background job in Parse Server.

Here's an example of how to create this job:

```javascript
// Background job to clean up expired OTPs
Parse.Cloud.job("cleanupExpiredOTPs", async () => {
  const query = new Parse.Query(OTP_TABLE_NAME);
  query.lessThan("expiresAt", new Date());

  const expiredOTPs = await query.find({ useMasterKey: true });
  await Parse.Object.destroyAll(expiredOTPs, { useMasterKey: true });

  console.log(`Cleaned up ${expiredOTPs.length} expired OTPs`);
});
```

## Contributing

Contributions are welcome! Please feel free to submit pull requests or open issues to discuss new features or improvements.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
