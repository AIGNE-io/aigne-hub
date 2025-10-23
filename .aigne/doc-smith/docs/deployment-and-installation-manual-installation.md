# Manual Installation

For developers who wish to contribute to AIGNE Hub or operators who require a customized deployment, a manual installation from the source code is the recommended approach. This guide provides a systematic, step-by-step process for setting up the project on a local machine. For a simpler, one-click deployment, please refer to the [Blocklet Store Deployment](./deployment-and-installation-blocklet-store.md) guide.

## Prerequisites

Before proceeding with the installation, ensure that your development environment meets the following requirements. The specified versions are minimum requirements for compatibility and stable operation.

| Software | Required Version |
| :--- | :--- |
| Node.js | `>= 18` |
| pnpm | `>= 9` |
| Git | Latest stable version |

## Installation Procedure

The installation process involves cloning the source code repository, navigating into the project directory, and installing the required dependencies using `pnpm`.

### Step 1: Clone the Source Repository

First, clone the official AIGNE Hub repository from GitHub to your local machine. Execute the following command in your terminal:

```bash Clone the repository icon=mdi:git
git clone https://github.com/blocklet/ai-kit.git
```

### Step 2: Navigate to the Project Directory

Once the cloning process is complete, change your current directory to the newly created project folder:

```bash Navigate to directory icon=mdi:folder-open-outline
cd ai-kit
```

### Step 3: Install Dependencies

Install all project dependencies using the `pnpm` package manager. This command will download and link all necessary packages as defined in the `pnpm-lock.yaml` file, ensuring a consistent and reliable build.

```bash Install dependencies icon=mdi:download
pnpm install
```

## Running the Application

After a successful installation, you can run the AIGNE Hub application. The available scripts cater to both development and production environments.

### Development Mode

To start the application in development mode with hot-reloading enabled, use the `dev` script. This is ideal for active development and testing.

```bash Start development server icon=mdi:play-circle-outline
pnpm dev
```

### Production Build

For a production deployment, you must first build the application. This process transpiles the TypeScript code, bundles the frontend assets, and optimizes the project for performance.

```bash Build for production icon=mdi:cogs
pnpm build
```

After the build is complete, you will need a separate mechanism, such as a process manager (e.g., PM2) or a Blocklet Server instance, to run the compiled application.

## Summary

You have now successfully installed AIGNE Hub from the source code. The next step is to configure the instance by connecting it to your chosen AI providers and setting up any optional features like credit-based billing.

For detailed instructions on post-installation setup, please proceed to the [Configuration](./configuration.md) section.