// Re-export all centralized types
export * from './pm';
export * from './chat';
export * from './admin';

// Generic types
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type EntityData = Record<string, any>;
