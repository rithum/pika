# Weather Service - TypeScript Example

This example demonstrates how to use the Pika Serverless Plugin with a TypeScript `serverless.ts` configuration file, providing full type safety and IntelliSense support.

## What This Example Shows

- **TypeScript Configuration**: Full type-safe serverless configuration
- **Comprehensive Weather Service**: Complete weather assistant with multiple functions
- **Advanced Features**: Historical weather, air quality, forecasts, and geocoding
- **Type Safety**: Full TypeScript support with `@serverless/typescript`
- **Production Ready**: Comprehensive error handling and logging

## Prerequisites

- Node.js 22.x or higher
- Serverless Framework v3.x
- TypeScript 5.x
- AWS CLI configured
- Deployed Pika infrastructure (agent and chat app custom resources)

## Quick Start

1. **Install dependencies**:

    ```bash
    npm install
    ```

2. **Build TypeScript**:

    ```bash
    npm run build
    ```

3. **Deploy the service**:

    ```bash
    npm run deploy:dev
    ```

## TypeScript Configuration Structure

The configuration is defined in `serverless.ts` with full TypeScript support:

```typescript
import { AWS } from '@serverless/typescript';

const serverlessConfiguration: AWS = {
  service: 'weather-service-ts',

  custom: {
    pika: {
      // Type-safe configuration
      agents: [...],
      chatApps: [...]
    }
  },

  functions: {
    weatherFunction: {
      handler: 'src/lambda/weather/index.handler'
    }
  }
};

module.exports = serverlessConfiguration;
```

## Weather Functions Available

This comprehensive weather service provides:

### Core Weather Functions

- **`getCurrentWeather`**: Current conditions with temperature, humidity, wind, pressure
- **`getWeatherForecast`**: Multi-day forecasts with detailed conditions
- **`getHistoricalWeather`**: Historical weather data analysis
- **`getAirQuality`**: Air quality index and pollutant levels
- **`getGeocoding`**: Convert location names to coordinates

### Advanced Features

- JSON parameters support for complex queries
- Timezone-aware responses
- Download links for data export
- Comprehensive weather advice
- Health advisories for air quality

## Example Queries

Once deployed, you can ask the weather assistant:

- **Current Weather**: "What's the current weather in San Francisco?"
- **Forecasts**: "What's the 7-day forecast for Tokyo with hourly temperature data?"
- **Historical Data**: "How did last month's weather in London compare to the average?"
- **Air Quality**: "What's the air quality index in Beijing today?"
- **Location Search**: "Find coordinates for major cities in Australia"

## TypeScript Benefits

- **Type Safety**: Compile-time checking of configuration
- **IntelliSense**: Auto-completion in VS Code and other editors
- **Refactoring**: Safe renaming and restructuring
- **Documentation**: Type annotations serve as inline documentation
- **Error Prevention**: Catch configuration errors before deployment

## Configuration Features Demonstrated

- Full TypeScript configuration with `@serverless/typescript`
- Type-safe Pika plugin configuration
- Comprehensive weather agent with multiple tools
- Advanced chat app features (suggestions, file upload, etc.)
- SSM parameter resolution for resource ARNs
- Production-ready error handling
- Multiple weather data sources simulation
- Health and weather advisories

## Development Workflow

1. **Edit**: Modify `serverless.ts` with full TypeScript support
2. **Build**: `npm run build` to compile TypeScript
3. **Deploy**: `npm run deploy:dev` to deploy changes
4. **Test**: Use chat UI or invoke functions locally
5. **Monitor**: `npm run logs` to view function execution

## Clean Up

To remove all deployed resources:

```bash
npm run remove
```

## Architecture

```
weather-service-ts/
├── src/
│   └── lambda/
│       └── weather/
│           └── index.ts          # Weather service implementation
├── serverless.ts                 # TypeScript configuration
├── tsconfig.json                 # TypeScript compiler config
├── package.json                  # Dependencies and scripts
└── README.md                     # This file
```

This example showcases the full power of combining Pika's AI capabilities with TypeScript's type safety for robust, maintainable serverless applications.
