# Self-Hosted Data Control

One of the fundamental security principles of AIGNE Hub is its self-hosted architecture. Unlike third-party SaaS AI gateways that require you to entrust them with your data and API credentials, AIGNE Hub is designed to be deployed entirely within your own infrastructure. This model provides complete control and privacy over your AI operations, making it a cornerstone of a secure and compliant AI strategy.

By running AIGNE Hub on your own servers—whether on-premises or in your private cloud—you create a secure perimeter where you dictate the rules. This eliminates the risks associated with multi-tenant environments and third-party data handling.

```d2 Self-Hosted vs. SaaS Data Control icon=graph-ql:comparison
direction: down

SaaS-Gateway-Model: {
  label: "SaaS AI Gateway Model"
  style: {
    stroke-dash: 2
  }

  Your-Infrastructure: {
    label: "Your Infrastructure"
    Your-Apps: {}
  }

  SaaS-Provider-Infrastructure: {
    label: "SaaS Provider Infrastructure"
    Gateway: {}
    Database: {
      label: "Database\n(Your Data & Keys)"
      shape: cylinder
    }
    Gateway -> Database
  }

  Your-Infrastructure.Your-Apps -> SaaS-Provider-Infrastructure.Gateway: "API Calls & Data"
}

AIGNE-Hub-Self-Hosted-Model: {
  label: "AIGNE Hub Self-Hosted Model"
  style: {
    stroke-dash: 2
  }

  Your-Infrastructure-2: {
    label: "Your Infrastructure"
    Your-Apps-2: {
      label: "Your Apps"
    }
    AIGNE-Hub: {
      label: "AIGNE Hub"
    }
    Database-2: {
      label: "Database\n(Your Data & Keys)"
      shape: cylinder
    }

    Your-Apps-2 -> AIGNE-Hub
    AIGNE-Hub -> Database-2
  }
}

AI-Providers: {
  shape: cylinder
}

SaaS-Gateway-Model.SaaS-Provider-Infrastructure.Gateway -> AI-Providers: "Proxied Requests"
AIGNE-Hub-Self-Hosted-Model.Your-Infrastructure-2.AIGNE-Hub -> AI-Providers: "Proxied Requests"

```

### Key Advantages of Self-Hosting

#### Complete Data Sovereignty

When you self-host AIGNE Hub, all data—including prompts, AI-generated responses, usage logs, and analytics—remains within your network boundaries. This is crucial for organizations that handle sensitive, proprietary, or regulated data, as it ensures compliance with data protection regulations like GDPR, HIPAA, and others. Your data is never processed or stored on external servers beyond your control.

#### Secure Credential Isolation

Your valuable AI provider API keys are one of your most sensitive assets. In a self-hosted environment, these credentials are encrypted and stored within the AIGNE Hub instance running on your servers. They are never exposed to or shared with any third-party, mitigating the risk of credential leakage from an external provider's security breach.

#### Customizable Security Policies

A self-hosted deployment allows you to integrate AIGNE Hub seamlessly into your existing security framework. You can apply your organization's specific security measures, such as:

- **Network Policies**: Restrict access using firewalls, VPCs, and IP whitelisting.
- **Access Control**: Integrate with your corporate identity and access management (IAM) systems.
- **Monitoring**: Channel logs and metrics into your established observability and SIEM tools.

This ensures that access to the AI gateway adheres to the same rigorous security standards applied to your other critical infrastructure.

### Summary

The decision to build AIGNE Hub as a self-hosted platform is a deliberate architectural choice designed to provide maximum security and control. By deploying the gateway within your own infrastructure, you retain full ownership of your data, secure your credentials, and enforce your own security policies. This approach is fundamental for any enterprise seeking to build a robust, secure, and compliant AI ecosystem.

For more details on specific security features, see [Credential Management](./security-credential-management.md) and [Access Control](./security-access-control.md).