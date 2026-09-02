import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const SESSION_COOKIE_NAME = "sunoaks_studio";
export const SESSION_COOKIE_PATH = "/studio";
export const SESSION_TTL_SECONDS = 60 * 60 * 12;
const secret = () => {
  if (process.env.STUDIO_SESSION_SECRET) {
    if (process.env.NODE_ENV === "production" && process.env.STUDIO_SESSION_SECRET.length < 32) {
      throw new Error("STUDIO_SESSION_SECRET must contain at least 32 characters in production.");
    }
    return process.env.STUDIO_SESSION_SECRET;
  }
  if (process.env.NODE_ENV === "production") throw new Error("STUDIO_SESSION_SECRET is required in production.");
  return "development-only-change-this-secret";
};

function sign(value: string) {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

export function credentialsAreValid(username: string, password: string) {
  if (process.env.NODE_ENV === "production" && (!process.env.STUDIO_USERNAME || !process.env.STUDIO_PASSWORD)) return false;
  const expectedUser = process.env.STUDIO_USERNAME || "marketing";
  const expectedPassword = process.env.STUDIO_PASSWORD || "sun-oaks-pilot";
  const left = Buffer.from(`${username}\0${password}`);
  const right = Buffer.from(`${expectedUser}\0${expectedPassword}`);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function createSession() {
  const expires = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const value = `${expires}.${sign(String(expires))}`;
  (await cookies()).set(SESSION_COOKIE_NAME, value, {
    httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production",
    path: SESSION_COOKIE_PATH, maxAge: SESSION_TTL_SECONDS,
  });
}

export async function destroySession() {
  (await cookies()).set(SESSION_COOKIE_NAME, "", {
    httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production",
    path: SESSION_COOKIE_PATH, maxAge: 0, expires: new Date(0),
  });
}

export async function isAuthenticated() {
  const value = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!value) return false;
  const [expires, signature] = value.split(".");
  if (!expires || !signature || Number(expires) < Date.now() / 1000) return false;
  const expected = Buffer.from(sign(expires));
  const actual = Buffer.from(signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
