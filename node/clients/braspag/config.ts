export interface BraspagCredentials {
  merchantId: string
  clientSecret: string
  merchantKey: string
}

export interface BraspagEnvironment {
  apiUrl: string
  authUrl: string
}

export interface BraspagConfig {
  credentials: BraspagCredentials
  environment: BraspagEnvironment
  isProduction: boolean
}

export class BraspagConfigBuilder {
  private static readonly PRODUCTION_ENV: BraspagEnvironment = {
    apiUrl: 'https://api.braspag.com.br',
    authUrl: 'https://auth.braspag.com.br/oauth2/token',
  }

  private static readonly SANDBOX_ENV: BraspagEnvironment = {
    apiUrl: 'https://apisandbox.braspag.com.br',
    authUrl: 'https://authsandbox.braspag.com.br/oauth2/token',
  }

  public static build(
    credentials: BraspagCredentials,
    isProduction = false
  ): BraspagConfig {
    this.validateCredentials(credentials)

    return {
      credentials,
      environment: isProduction ? this.PRODUCTION_ENV : this.SANDBOX_ENV,
      isProduction,
    }
  }

  private static validateCredentials(credentials: BraspagCredentials): void {
    const { merchantId, clientSecret, merchantKey } = credentials

    if (!merchantId?.trim()) {
      throw new Error('BraspagConfig: merchantId is required')
    }

    if (!clientSecret?.trim()) {
      throw new Error('BraspagConfig: clientSecret is required')
    }

    if (!merchantKey?.trim()) {
      throw new Error('BraspagConfig: merchantKey is required')
    }
  }
}
