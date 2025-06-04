# Changelog

## [v2.2.0](https://github.com/0xtiby/parse-server-otp-auth-adapter/releases/tag/v2.2.0) (2025-06-04)

# [2.2.0](https://github.com/0xtiby/parse-server-otp-auth-adapter/compare/v2.1.0...v2.2.0) (2025-06-04)


### Features

* add semantic-release, branch protection and github actions workflows ([f451e18](https://github.com/0xtiby/parse-server-otp-auth-adapter/commit/f451e1823ce29090762a59a0aca078a23adcbd59))





## [v2.0.1](https://github.com/0xtiby/parse-server-otp-auth-adapter/releases/tag/v2.0.1) (2025-04-15)



## [v2.0.0](https://github.com/0xtiby/parse-server-otp-auth-adapter/releases/tag/v2.0.0) (2025-04-14)

**Breaking Change:**

- Automatic configuration of the Otp table has been removed.

**New Feature:**

- 
- You must now call the exported `setupOtpTable(config)` function after initializing Parse Server.
- The required schema for the Otp table is now exported (`OTP_TABLE_SCHEMA`).

## [1.0.0](https://github.com/0xtiby/parse-server-otp-auth-adapter/releases/tag/1.0.0) (2024-09-28)



