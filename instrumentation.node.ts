import { LangfuseVercelAiSdkIntegration } from '@langfuse/vercel-ai-sdk';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { registerTelemetry } from 'ai';

import { langfuseSpanProcessor } from './src/otel/langfuse';

new NodeSDK({ spanProcessors: [langfuseSpanProcessor] }).start();
registerTelemetry(new LangfuseVercelAiSdkIntegration());
