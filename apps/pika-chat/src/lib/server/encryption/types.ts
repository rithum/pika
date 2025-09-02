export interface InfrastructureConfig {
    region: string;
    stage: string;
    awsAccountId: string;
    projNameKebabCase: string;
    ssmParameterPrefix: string;
    kmsKeyAlias: string;
    maxKeyVersions: number;
}

export interface InfrastructureStatus {
    kmsKeyExists: boolean;
    kmsKeyId?: string;
    kmsKeyArn?: string;
    ssmParametersExist: boolean;
    parametersChecked: string[];
    isInitialized: boolean;
    currentVersion?: number;
    activeVersions?: number[];
    lastRotationTime?: Date;
}

export interface SsmKeyParameters {
    currentVersion?: number;
    activeVersions?: number[];
    lastRotationTime?: Date;
    encryptedKeys?: Record<number, string>;
}

export interface KeyRotationResult {
    oldVersion: number;
    newVersion?: number;
    activeVersions: number[];
    isInitialization: boolean;
}
