# Prerequisites

Before deploying AIGNE Hub, it's crucial to ensure that your target environment is properly configured with all the necessary dependencies. Meeting these requirements is a fundamental step for both one-click and manual installation methods, guaranteeing a smooth setup and stable operation.

The following software must be installed and configured on your system:

### Core Requirements

| Software | Version | Description |
|---|---|---|
| **Node.js** | ≥ 18.0.0 | The JavaScript runtime environment required to execute the AIGNE Hub backend. We recommend using the latest Long-Term Support (LTS) version. You can download it from the [official Node.js website](https://nodejs.org/). |
| **pnpm** | ≥ 9.0.0 | The package manager used for this project. pnpm is required for efficiently managing dependencies within the monorepo structure. Installation instructions are available at [pnpm.io](https://pnpm.io/installation). |
| **Blocklet Server** | - | AIGNE Hub is designed as a Blocklet and requires Blocklet Server as its deployment and runtime environment. It handles containerization, lifecycle management, and integration with the wider ArcBlock ecosystem. |


You can verify your environment with the following commands:

```bash Check Versions icon=lucide:terminal
# Check Node.js version
node -v

# Check pnpm version
pnpm -v
```

With these prerequisites in place, your environment is ready for AIGNE Hub. You can now proceed to the installation method that best suits your needs, either through the [Blocklet Store Deployment](./deployment-and-installation-blocklet-store.md) for a quick setup or a [Manual Installation](./deployment-and-installation-manual-installation.md) for more advanced control.