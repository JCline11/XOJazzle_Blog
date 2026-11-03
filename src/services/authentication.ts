export const DUMMY_PASSWORD_HASH =
  "$2b$12$MG1zLty80oFimpvXE4eaWepvs7pm1lHejxkhXeSVvgJSYW8Enhz8G";

export type AdminCredentialRecord = {
  id: number;
  email: string;
  passwordHash: string;
  updatedAt: Date;
};

export type AuthenticationDependencies = {
  findAdminByEmail: (
    email: string
  ) => Promise<AdminCredentialRecord | null>;

  comparePassword: (
    password: string,
    passwordHash: string
  ) => Promise<boolean>;
};

export function createAuthenticateAdmin(
  dependencies: AuthenticationDependencies
) {
  return async function authenticateAdmin(
    email: string,
    password: string
  ) {
    const normalizedEmail =
      email.trim().toLowerCase();

    const admin =
      await dependencies.findAdminByEmail(
        normalizedEmail
      );

    const passwordHash =
      admin?.passwordHash ?? DUMMY_PASSWORD_HASH;

    const passwordMatches =
      await dependencies.comparePassword(
        password,
        passwordHash
      );

    if (!admin || !passwordMatches) {
      return null;
    }

    return {
      id: admin.id,
      email: admin.email,
      sessionVersion:
        admin.updatedAt.toISOString()
    };
  };
}
