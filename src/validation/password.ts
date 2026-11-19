export const MAX_BCRYPT_PASSWORD_BYTES = 72;

export function isWithinBcryptByteLimit(
  password: string
): boolean {
  return Buffer.byteLength(password, "utf8") <=
    MAX_BCRYPT_PASSWORD_BYTES;
}