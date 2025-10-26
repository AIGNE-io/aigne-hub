# Prerequisites

Before deploying AIGNE Hub, it is essential to ensure that the target environment meets the specified software and system requirements. This section outlines the necessary dependencies for a successful installation and smooth operation. Adhering to these prerequisites will prevent compatibility issues and facilitate the deployment process.

## Software Requirements

The following software components must be installed and correctly configured on the host system.

### Node.js

AIGNE Hub is a Node.js application and requires a specific version of the runtime to function correctly.

*   **Requirement**: Node.js is the JavaScript runtime environment that executes the AIGNE Hub backend services.
*   **Required Version**: `18.0.0` or higher.
*   **Verification**: To check your installed version, execute the following command in your terminal:
    ```bash Node.js Version Check icon=logos:nodejs-icon
    node -v
    ```
*   **Installation**: If you do not have Node.js installed or need to upgrade, it is recommended to use a version manager like [nvm](https://github.com/nvm-sh/nvm) (for Linux/macOS) or [nvm-windows](https://github.com/coreybutler/nvm-windows) to manage multiple Node.js versions. Official installers are also available on the [Node.js website](https://nodejs.org/).

### pnpm

For manual installations from source or for development purposes, `pnpm` is the specified package manager. It is required for efficient dependency management.

*   **Requirement**: `pnpm` is a fast, disk space-efficient package manager. It is used to install and manage the project's dependencies.
*   **Required Version**: `9.0.0` or higher.
*   **Verification**: To check your installed version, run this command:
    ```bash pnpm Version Check icon=logos:pnpm
    pnpm -v
    ```
*   **Installation**: `pnpm` can be installed via npm (which is included with Node.js) or other methods. The recommended approach is to use their standalone script. For detailed instructions, please refer to the [official pnpm installation guide](https://pnpm.io/installation).

    ```bash Install pnpm icon=logos:pnpm
    npm install -g pnpm
    ```

## Deployment Environment

AIGNE Hub is designed and packaged as a [Blocklet](https://www.blocklet.io/), which runs on the Blocklet Server.

### Blocklet Server

Blocklet Server is the cloud-native application server that manages the lifecycle, configuration, and operation of Blocklets like AIGNE Hub.

*   **Requirement**: Blocklet Server provides the necessary runtime environment, including reverse proxying, automatic HTTPS, and user authentication, which are essential for AIGNE Hub's operation.
*   **Installation**: Blocklet Server can be installed on various platforms. The recommended and simplest method is using the `blocklet-cli`.
    ```bash Install Blocklet CLI icon=lucide:terminal
    npm install -g @blocklet/cli
    ```
    Once the CLI is installed, you can initialize and start the server.
    ```bash Initialize Blocklet Server icon=lucide:server
    blocklet server init
    blocklet server start
    ```
*   **Further Information**: For comprehensive installation and management instructions, please consult the [Blocklet Server documentation](https://docs.blocklet.io/docs/en/getting-started).

## Summary

To summarize, a compliant deployment environment for AIGNE Hub requires:

| Component        | Minimum Version | Purpose                                     |
| ---------------- | --------------- | ------------------------------------------- |
| Node.js          | `>= 18.0.0`     | JavaScript runtime environment              |
| pnpm             | `>= 9.0.0`      | Package management (for manual builds)      |
| Blocklet Server  | Latest          | Application server and runtime environment  |

Ensuring these prerequisites are met is the first and most critical step for a stable and secure AIGNE Hub deployment. Once your environment is correctly set up, you can proceed to the installation guides.

- For the recommended one-click deployment, see [Blocklet Store Deployment](./deployment-and-installation-blocklet-store.md).
- For developers and advanced users, follow the [Manual Installation](./deployment-and-installation-manual-installation.md) guide.