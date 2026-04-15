import bcrypt from "bcryptjs";
import jwt, { type SignOptions } from "jsonwebtoken";
import { config } from "../config/index.js";

export type JwtPayload = {
  sub: string; // userId
  tenantId: string;
  email: string;
};

const BCRYPT_COST = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

export async function comparePassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function signToken(payload: JwtPayload): string {
  const opts: SignOptions = {
    algorithm: "HS256",
    expiresIn: config.JWT_EXPIRES_IN as SignOptions["expiresIn"],
  };
  return jwt.sign(payload, config.JWT_SECRET, opts);
}

export function verifyToken(token: string): JwtPayload {
  const decoded = jwt.verify(token, config.JWT_SECRET, {
    algorithms: ["HS256"],
  }) as JwtPayload;
  if (!decoded.sub || !decoded.tenantId || !decoded.email) {
    throw new Error("invalid jwt payload");
  }
  return decoded;
}
