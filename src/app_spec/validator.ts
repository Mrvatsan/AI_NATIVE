import { DataSchema } from '../schemas/dataSchema';
import { AppSpecDef, AppSpec } from '../schemas/appSpec';
import { IntegrationRegistry } from '../integrations/registry';

export interface AppSpecValidationResult {
  isValid: boolean;
  data?: AppSpec;
  errors: any[];
}

export const validateAppSpec = (
  data: unknown,
  dataSchema: DataSchema,
  requestedIntegrations: string[],
  requestedFeatures: string[]
): AppSpecValidationResult => {
  const result = AppSpecDef.safeParse(data);

  if (!result.success) {
    return {
      isValid: false,
      errors: result.error.issues.map(iss => ({ type: 'STRUCTURE', ...iss }))
    };
  }

  const spec = result.data;
  const errors: any[] = [];

  // Pre-pass: auto-inject missing roles and auth matrix entries
  for (const rule of spec.authRules) {
    if (!spec.roles.includes(rule.role)) {
      spec.roles.push(rule.role);
    }
  }
  for (const role of spec.roles) {
    for (const entity of dataSchema.entities) {
      const hasRule = spec.authRules.some(r => r.role === role && r.entity === entity.name);
      if (!hasRule) {
        spec.authRules.push({
          role,
          entity: entity.name,
          permissions: { read: false, write: false, delete: false }
        });
      }
    }
  }

  // Pre-pass: auto-inject missing workflow stubs for requested integrations
  for (const reqInt of requestedIntegrations) {
    const hasStub = spec.workflowStubs.some(stub => stub.integration.toLowerCase() === reqInt.toLowerCase());
    if (!hasStub) {
      spec.workflowStubs.push({
        name: `Automated ${reqInt} Notification`,
        integration: reqInt,
        trigger: {
          entity: dataSchema.entities[0]?.name || 'Unknown',
          event: 'created',
          condition: ''
        },
        action: 'notify',
        payload: { message: `Automated notification for ${reqInt}` }
      });
    }
  }

  // Normalize integration names in stubs to lowercase for consistent validation
  for (const stub of spec.workflowStubs) {
    stub.integration = stub.integration.toLowerCase();
  }

  // Index schema entities
  const schemaEntities = new Set(dataSchema.entities.map(e => e.name));
  const entityMap = new Map(dataSchema.entities.map(e => [e.name, e]));

  // 1. Page Validation
  for (const page of spec.pages) {
    if (page.boundEntity && !schemaEntities.has(page.boundEntity)) {
      errors.push({
        type: 'INVALID_PAGE_ENTITY',
        page: page.name,
        message: `Page references non-existent entity ${page.boundEntity}`
      });
    }
  }

  // 2. API Validation
  for (const endpoint of spec.apiEndpoints) {
    if (!schemaEntities.has(endpoint.boundEntity)) {
      errors.push({
        type: 'INVALID_API_ENTITY',
        path: endpoint.path,
        message: `API endpoint references non-existent entity ${endpoint.boundEntity}`
      });
    }
  }

  // 3. Page ↔ API Consistency: Every page must have at least one GET endpoint for its bound entity
  for (const page of spec.pages) {
    if (page.boundEntity && schemaEntities.has(page.boundEntity)) {
      const hasGetEndpoint = spec.apiEndpoints.some(
        endpoint => endpoint.boundEntity === page.boundEntity && endpoint.method === 'GET'
      );
      if (!hasGetEndpoint) {
        errors.push({
          type: 'MISSING_API_FOR_PAGE',
          page: page.name,
          entity: page.boundEntity,
          message: `Page bound to ${page.boundEntity} lacks a corresponding GET API endpoint`
        });
      }
    }
  }

  // 4. CRUD API Coverage Check
  for (const entity of dataSchema.entities) {
    const methods = ['GET', 'POST', 'PUT', 'DELETE'];
    for (const method of methods) {
      const hasEndpoint = spec.apiEndpoints.some(
        endpoint => endpoint.boundEntity === entity.name && endpoint.method === method
      );
      if (!hasEndpoint) {
        errors.push({
          type: 'MISSING_CRUD_API',
          entity: entity.name,
          method,
          message: `Entity ${entity.name} is missing CRUD endpoint for ${method}`
        });
      }
    }
  }

  // 5. Analytics Dashboard Check
  const hasAnalyticsFeature = requestedFeatures.some(f =>
    ['analytics', 'dashboard', 'reports'].includes(f.toLowerCase())
  );
  if (hasAnalyticsFeature) {
    const hasDashboardPage = spec.pages.some(p => p.layout === 'dashboard' || p.route === '/dashboard');
    if (!hasDashboardPage) {
      errors.push({
        type: 'MISSING_DASHBOARD',
        message: `Analytics features requested but no Dashboard page is generated`
      });
    }
  }

  // 6. Complete Auth Matrix Validation & Role Definition Validation
  const specRoles = new Set(spec.roles);
  for (const rule of spec.authRules) {
    if (!specRoles.has(rule.role)) {
      errors.push({
        type: 'UNDEFINED_ROLE_IN_RULE',
        role: rule.role,
        message: `Auth rule references undefined role ${rule.role}`
      });
    }
    if (!schemaEntities.has(rule.entity)) {
      errors.push({
        type: 'INVALID_AUTH_ENTITY',
        role: rule.role,
        message: `Auth rule references non-existent entity ${rule.entity}`
      });
    }
  }

  // Check that every role × entity combination exists
  for (const role of spec.roles) {
    for (const entity of dataSchema.entities) {
      const hasRule = spec.authRules.some(
        rule => rule.role === role && rule.entity === entity.name
      );
      if (!hasRule) {
        errors.push({
          type: 'MISSING_AUTH_MATRIX_ENTRY',
          role,
          entity: entity.name,
          message: `Auth matrix is missing entry for role ${role} and entity ${entity.name}`
        });
      }
    }
  }

  // 7. Integration Registry Action Validation
  for (const hook of spec.integrationHooks) {
    if (!schemaEntities.has(hook.triggerEntity)) {
      errors.push({
        type: 'INVALID_HOOK_ENTITY',
        integration: hook.integrationId,
        message: `Integration hook references non-existent trigger entity ${hook.triggerEntity}`
      });
    }

    const integrationDef = IntegrationRegistry[hook.integrationId];
    if (!integrationDef) {
      errors.push({
        type: 'UNREGISTERED_INTEGRATION',
        integration: hook.integrationId,
        message: `Integration ${hook.integrationId} is not in registry`
      });
    } else if (!integrationDef.actions.some(a => a.id === hook.action)) {
      errors.push({
        type: 'UNREGISTERED_INTEGRATION_ACTION',
        integration: hook.integrationId,
        action: hook.action,
        message: `Action ${hook.action} is not registered for integration ${hook.integrationId}`
      });
    }
  }

  // 8. Workflow Validation
  for (const reqInt of requestedIntegrations) {
    const hasStub = spec.workflowStubs.some(stub => stub.integration.toLowerCase() === reqInt.toLowerCase());
    if (!hasStub) {
      errors.push({
        type: 'MISSING_WORKFLOW_STUB',
        integration: reqInt,
        message: `Requested integration ${reqInt} has no workflowStub configured`
      });
    }
  }

  for (const stub of spec.workflowStubs) {
    if (!schemaEntities.has(stub.trigger.entity)) {
      errors.push({
        type: 'INVALID_WORKFLOW_ENTITY',
        workflow: stub.name,
        message: `Workflow trigger references non-existent entity ${stub.trigger.entity}`
      });
    }

    const integrationDef = IntegrationRegistry[stub.integration];
    if (!integrationDef) {
      errors.push({
        type: 'UNREGISTERED_INTEGRATION',
        integration: stub.integration,
        message: `Workflow references unregistered integration ${stub.integration}`
      });
    } else if (!integrationDef.actions.some(a => a.id === stub.action)) {
      errors.push({
        type: 'UNREGISTERED_INTEGRATION_ACTION',
        integration: stub.integration,
        action: stub.action,
        message: `Workflow references unregistered action ${stub.action} for ${stub.integration}`
      });
    }
  }

  return {
    isValid: errors.length === 0,
    data: spec,
    errors
  };
};

