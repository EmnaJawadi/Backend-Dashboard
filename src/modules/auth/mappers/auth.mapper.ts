export class AuthMapper {
  static toAuthResponse(data: {
    user: {
      id: string;
      firstName: string;
      lastName?: string | null;
      email: string;
      role: string;
      isActive: boolean;
    };
    accessToken: string;
    refreshToken: string;
  }) {
    return {
      user: {
        ...data.user,
        fullName: [data.user.firstName, data.user.lastName]
          .filter(Boolean)
          .join(' '),
      },
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      tokenType: 'Bearer',
    };
  }
}