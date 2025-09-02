export function generateKmsKeyAliasName(projNameKebabCase: string, stage: string): string {
    return `alias/${projNameKebabCase}-cookie-encryption-${stage}`;
}

export function generateSsmParamPrefix(projNameKebabCase: string, stage: string): string {
    return `/stack/${projNameKebabCase}/${stage}/cookie-encryption`;
}
