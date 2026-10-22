/** True inside ECS or Lambda, where local-only overrides must never apply. */
export function isDeployedRuntime(env: NodeJS.ProcessEnv = process.env): boolean {
    return !!(env.ECS_CONTAINER_METADATA_URI || env.ECS_CONTAINER_METADATA_URI_V4 || env.AWS_EXECUTION_ENV || env.AWS_LAMBDA_FUNCTION_NAME);
}
