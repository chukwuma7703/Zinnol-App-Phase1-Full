import { ExternalServiceError } from '../utils/AppError.js';
import axios from 'axios';

/**
 * HTTP Client with robust error handling, timeouts, and retries
 */
class HttpClient {
  constructor(options = {}) {
    this.options = options;
    this.serviceName = options.serviceName || 'External Service';
    this.client = null;
    this.initClient(options);
  }

  initClient(options = {}) {
    this.client = axios.create({
      timeout: options.timeout || 10000, // 10 second timeout
      retries: options.retries || 3,
      retryDelay: options.retryDelay || 1000, // 1 second base delay
      ...options
    });

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        const { config, response, code } = error;

        // Don't retry on 4xx errors (client errors)
        if (response && response.status >= 400 && response.status < 500) {
          throw new ExternalServiceError(
            config.serviceName || this.serviceName,
            `Client error: ${response.status} ${response.statusText}`
          );
        }

        // Handle network errors and 5xx errors with retries
        if (!config.retryCount) {
          config.retryCount = 0;
        }

        if (config.retryCount < (config.retries || 3)) {
          config.retryCount += 1;

          // Exponential backoff
          const delay = (config.retryDelay || 1000) * Math.pow(2, config.retryCount - 1);

          console.warn(`Retrying ${config.url} (attempt ${config.retryCount}/${config.retries || 3}) after ${delay}ms`);

          await new Promise(resolve => setTimeout(resolve, delay));
          return this.client(config);
        }

        // If all retries failed
        const errorMessage = response
          ? `${config.method?.toUpperCase() || 'UNKNOWN'} ${config.url || 'unknown'} failed: ${error.message}`
          : code === 'ECONNABORTED'
            ? `${config.method?.toUpperCase() || 'UNKNOWN'} ${config.url || 'unknown'} failed: Request timeout`
            : `${config.method?.toUpperCase() || 'UNKNOWN'} ${config.url || 'unknown'} failed: ${error.message}`;

        throw new ExternalServiceError(this.serviceName, errorMessage);
      }
    );
  }

  /**
   * GET request
   */
  async get(url, config = {}) {
    try {
      if (!this.client) {
        this.initClient();
      }
      const response = await this.client.get(url, { ...config, serviceName: this.serviceName });
      return response.data;
    } catch (error) {
      if (error instanceof ExternalServiceError) {
        throw error;
      }
      let message = error.message;
      if (error.code === 'ECONNABORTED' || message.includes('timeout')) {
        message = 'Request timeout';
      }
      throw new ExternalServiceError(
        config.serviceName || this.serviceName,
        `GET ${url} failed: ${message}`
      );
    }
  }

  /**
   * POST request
   */
  async post(url, data = {}, config = {}) {
    try {
      if (!this.client) {
        this.initClient();
      }
      const response = await this.client.post(url, data, { ...config, serviceName: this.serviceName });
      return response.data;
    } catch (error) {
      if (error instanceof ExternalServiceError) {
        throw error;
      }
      let message = error.message;
      if (error.code === 'ECONNABORTED' || message.includes('timeout')) {
        message = 'Request timeout';
      }
      throw new ExternalServiceError(
        config.serviceName || this.serviceName,
        `POST ${url} failed: ${message}`
      );
    }
  }

  /**
   * PUT request
   */
  async put(url, data = {}, config = {}) {
    try {
      if (!this.client) {
        this.initClient();
      }
      const response = await this.client.put(url, data, config);
      return response.data;
    } catch (error) {
      if (error instanceof ExternalServiceError) {
        throw error;
      }
      throw new ExternalServiceError(
        config.serviceName || this.serviceName,
        `PUT ${url} failed: ${error.message}`
      );
    }
  }

  /**
   * DELETE request
   */
  async delete(url, config = {}) {
    try {
      if (!this.client) {
        this.initClient();
      }
      const response = await this.client.delete(url, config);
      return response.data;
    } catch (error) {
      if (error instanceof ExternalServiceError) {
        throw error;
      }
      throw new ExternalServiceError(
        config.serviceName || this.serviceName,
        `DELETE ${url} failed: ${error.message}`
      );
    }
  }
}

// Create instances for different services
export const weatherClient = new HttpClient({
  timeout: 15000, // Weather APIs can be slow
  retries: 2,
  serviceName: 'OpenWeather API'
});

export const ocrClient = new HttpClient({
  timeout: 30000, // OCR can take longer
  retries: 1,
  serviceName: 'Google Cloud Vision API'
});

export const firebaseClient = new HttpClient({
  timeout: 10000,
  retries: 3,
  serviceName: 'Firebase'
});

export const httpClient = new HttpClient({
  timeout: 10000,
  retries: 3,
  serviceName: 'External Service'
});

export default HttpClient;
