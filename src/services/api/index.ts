/**
 * API Service Layer - Enterprise Grade
 * 
 * This module provides a centralized API layer with:
 * - Request queuing and rate limiting
 * - Multi-level caching (memory + localStorage)
 * - Automatic retry with exponential backoff
 * - Request deduplication
 * - Offline support
 * - Type-safe responses
 * 
 * @module api
 */

export * from './apiClient';
export * from './cache';
export * from './queue';
export * from './types';

// API modules
export * from './modules/questions';
export * from './modules/chapters';
export * from './modules/topics';
export * from './modules/batches';
export * from './modules/users';
export * from './modules/tests';
export * from './modules/ai';
export * from './modules/payments';
