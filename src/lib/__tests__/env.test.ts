import { describe, it, expect } from "vitest";
import { validateServerEnv } from "../env";

const validEnv = (overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv =>
  ({
    MONGODB_URI: "mongodb://localhost:27017",
    NEXTAUTH_SECRET: "test-secret-at-least-32-chars-long",
    ...overrides,
  }) as unknown as NodeJS.ProcessEnv;

describe("env", () => {
  describe("validateServerEnv", () => {
    it("returns validated object when required vars are set", () => {
      const env = validEnv();
      const result = validateServerEnv(env);
      expect(result.MONGODB_URI).toBe("mongodb://localhost:27017");
      expect(result.MONGODB_DB).toBe("myinvestments");
      expect(result.NEXTAUTH_SECRET).toBe("test-secret-at-least-32-chars-long");
      expect(result.NEXTAUTH_URL).toBe("http://localhost:3000");
    });

    it("accepts MONGODB_URI_B64 instead of MONGODB_URI", () => {
      const b64 = Buffer.from("mongodb://user:pass@host/db", "utf8").toString("base64");
      const result = validateServerEnv(validEnv({ MONGODB_URI: undefined, MONGODB_URI_B64: b64 }));
      expect(result.MONGODB_URI).toBe("mongodb://user:pass@host/db");
    });

    it("accepts AUTH_SECRET instead of NEXTAUTH_SECRET", () => {
      const result = validateServerEnv(
        validEnv({ NEXTAUTH_SECRET: undefined, AUTH_SECRET: "auth-secret" })
      );
      expect(result.NEXTAUTH_SECRET).toBe("auth-secret");
    });

    it("uses MONGODB_DB when set", () => {
      const result = validateServerEnv(validEnv({ MONGODB_DB: "SmartTrader" }));
      expect(result.MONGODB_DB).toBe("SmartTrader");
    });

    it("throws with message containing var name when MONGODB_URI and MONGODB_URI_B64 are missing", () => {
      const env = validEnv({ MONGODB_URI: undefined });
      expect(() => validateServerEnv(env)).toThrow(/MONGODB_URI/);
      expect(() => validateServerEnv(env)).toThrow(/Either MONGODB_URI or MONGODB_URI_B64/);
    });

    it("throws with message containing var name when NEXTAUTH_SECRET and AUTH_SECRET are missing", () => {
      const env = validEnv({ NEXTAUTH_SECRET: undefined });
      expect(() => validateServerEnv(env)).toThrow(/NEXTAUTH_SECRET/);
    });

    it("throws when NEXTAUTH_SECRET is empty string", () => {
      const env = validEnv({ NEXTAUTH_SECRET: "" });
      expect(() => validateServerEnv(env)).toThrow(/NEXTAUTH_SECRET/);
    });
  });
});
