/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Comprehensive logging utility with timestamps and context for debugging
 */
export const log = {
  info: (context: string, message: string, metadata?: object) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [INFO] [${context}] ${message}`, metadata || '');
  },

  error: (context: string, message: string, error?: Error, metadata?: object) => {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] [ERROR] [${context}] ${message}`, {
      error: error?.message,
      stack: error?.stack,
      ...metadata
    });
  },

  debug: (context: string, message: string, metadata?: object) => {
    const timestamp = new Date().toISOString();
    console.debug(`[${timestamp}] [DEBUG] [${context}] ${message}`, metadata || '');
  },

  video: (nodeId: string, event: string, metadata?: object) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [VIDEO] [${nodeId}] ${event}`, metadata || '');
  },

  warn: (context: string, message: string, metadata?: object) => {
    const timestamp = new Date().toISOString();
    console.warn(`[${timestamp}] [WARN] [${context}] ${message}`, metadata || '');
  }
};

