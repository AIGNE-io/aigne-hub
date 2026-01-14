# Release Notes

This document provides a detailed record of all notable changes, new features, and bug fixes for AIGNE Hub. DevOps and SRE teams can use this information to track the platform's evolution, understand the impact of each update, and schedule upgrades accordingly.

## October 2025

### New Features

*   **Video Generation Support**: The platform's core capabilities have been extended to support video generation models. A new `video` type has been added to the `ModelCalls` table to track these requests.
*   **Media Duration Analytics**: To enhance usage tracking for multimedia content, a `mediaDuration` field has been added to the `Usages` table. This allows for more precise cost and consumption analysis of audio and video generation.
*   **Request Tracing**: A `traceId` field has been added to all model calls. This identifier improves observability by allowing requests to be tracked consistently across different system components, simplifying debugging and performance analysis.

## September 2025

### New Features

*   **Credential Weighting for Load Balancing**: A `weight` attribute has been added to AI provider credentials. This feature enables weighted load balancing, allowing administrators to distribute API traffic across multiple keys based on predefined priorities, such as routing more requests to higher-limit or lower-cost credentials.
*   **Credential Error Tracking**: An `error` field has been added to the `AiCredentials` table. This allows the system to store the last known error associated with a specific credential, improving diagnostics and making it easier to identify and resolve issues with provider API keys.

## August 2025

### New Features

*   **Model Health Monitoring**: A new system for tracking the operational status of individual AI models has been introduced. The `AiModelStatuses` table now records the health and availability of each model, providing better insight into provider-side issues and improving overall system reliability.

---

This summary provides an overview of recent updates. For more detailed information on integrating and managing these features, please refer to the relevant sections of the documentation.