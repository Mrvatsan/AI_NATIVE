import pino from 'pino';

// Simple structured logger using pino
export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

export const logStageEvent = (
  stageName: string,
  event: 'START' | 'VALIDATION' | 'REPAIR' | 'REPAIR_OUTCOME' | 'COMPLETE' | 'ERROR',
  details: Record<string, any>
) => {
  logger.info({
    stageName,
    timestamp: new Date().toISOString(),
    event,
    ...details
  });
};
