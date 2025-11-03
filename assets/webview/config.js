(function () {
  const vscode = acquireVsCodeApi();
  console.log('[ConfigWebview] Script loaded');

  const providersList = document.getElementById('providers-list');
  const modelsList = document.getElementById('models-list');
  const addProviderBtn = document.getElementById('add-provider-btn');
  const addModelBtn = document.getElementById('add-model-btn');
  const saveBtn = document.getElementById('save-config-btn');

  let providers = [];
  let models = [];

  // Global diagnostic for button clicks
  document.addEventListener('click', (e) => {
    const target = e.target;
    if (!target) return;
    const btn = target.closest && target.closest('button');
    if (btn) {
      console.log('[ConfigWebview] Button click', {
        text: btn.innerText,
        classes: btn.className,
        id: btn.id || undefined,
      });
    }
  });

  // Request initial configuration
  console.log('[ConfigWebview] Posting load request to extension');
  vscode.postMessage({ command: 'load' });

  // Listen for messages from the extension
  window.addEventListener('message', (event) => {
    const message = event.data;
    console.log('[ConfigWebview] Received message from extension', message && message.command, message);
    switch (message.command) {
      case 'loadConfiguration':
        providers = message.providers || [];
        models = message.models || [];
        console.log('[ConfigWebview] Loaded configuration', { providersCount: providers.length, modelsCount: models.length });
        renderProviders();
        renderModels();
        break;
    }
  });

  // Event listeners
  addProviderBtn.addEventListener('click', () => {
    console.log('[ConfigWebview] addProvider called');
    providers.push({ key: '', baseUrl: '', displayName: '', defaults: {} });
    console.log('[ConfigWebview] providers length after add:', providers.length);
    renderProviders();
  });

  addModelBtn.addEventListener('click', () => {
    console.log('[ConfigWebview] addModel called');
    // Create grouped model structure by default
    models.push({ model_properties: { id: '', provider: '', owned_by: '' }, model_parameters: {} });
    console.log('[ConfigWebview] models length after add:', models.length);
    renderModels();
  });

  saveBtn.addEventListener('click', () => {
    console.log('[ConfigWebview] saveConfiguration called', { providersCount: providers.length, modelsCount: models.length });

    const invalidProviders = providers.filter((p) => !p.key || !p.baseUrl);
    if (invalidProviders.length > 0) {
      alert('Please fill in required fields (key and baseUrl) for all providers.');
      return;
    }

    // Models must use grouped structure: model_properties.id is required
    const invalidModels = models.filter((m) => !(m && m.model_properties && m.model_properties.id));
    if (invalidModels.length > 0) {
      alert('Please fill in required field (id) for all models.');
      return;
    }

    const cleanProviders = providers.map((p) => {
      const cleaned = Object.assign({}, p);
      // If provider.defaults is grouped but empty, remove it
      if (cleaned.defaults) {
        // if grouped
        if (cleaned.defaults.model_properties || cleaned.defaults.model_parameters) {
          const mp = cleaned.defaults.model_properties || {};
          const par = cleaned.defaults.model_parameters || {};
          if (Object.keys(mp).length === 0 && Object.keys(par).length === 0) {
            delete cleaned.defaults;
          }
        } else if (Object.keys(cleaned.defaults).length === 0) {
          delete cleaned.defaults;
        }
      }
      return cleaned;
    });

    // Ensure models are saved in grouped form
    const groupedModels = models.map((m) => {
      if (m.model_properties && m.model_parameters) return m;
      // migrate flat model to grouped
      const flat = Object.assign({}, m);
      const model_properties = {
        id: flat.id,
        provider: flat.provider,
        configId: flat.configId,
        owned_by: flat.owned_by,
        baseUrl: flat.baseUrl,
        displayName: flat.displayName,
        family: flat.family,
        context_length: flat.context_length,
        vision: flat.vision,
      };
      const model_parameters = {
        max_tokens: flat.max_tokens,
        max_completion_tokens: flat.max_completion_tokens,
        temperature: flat.temperature != null ? flat.temperature : undefined,
        top_p: flat.top_p != null ? flat.top_p : undefined,
        top_k: flat.top_k,
        min_p: flat.min_p,
        frequency_penalty: flat.frequency_penalty,
        presence_penalty: flat.presence_penalty,
        repetition_penalty: flat.repetition_penalty,
        thinking_budget: flat.thinking_budget,
        thinking: flat.thinking,
        reasoning: flat.reasoning,
        reasoning_effort: flat.reasoning_effort,
        extra: flat.extra
      };
      // Remove undefined keys
      Object.keys(model_parameters).forEach(k => model_parameters[k] === undefined && delete model_parameters[k]);
      return { model_properties, model_parameters };
    });

    console.log('[ConfigWebview] Posting save to extension', { cleanProviders, models: groupedModels });
    vscode.postMessage({ command: 'save', providers: cleanProviders, models: groupedModels });
  });

  // Delegated events for providers list
  providersList.addEventListener('click', (e) => {
    const target = e.target;
    if (!target) return;

    const removeBtn = target.closest && target.closest('button[data-action="remove-provider"]');
    if (removeBtn) {
      const index = parseInt(removeBtn.getAttribute('data-index'));
      console.log('[ConfigWebview] removeProvider called', { index });
      providers.splice(index, 1);
      renderProviders();
      return;
    }
  });

  providersList.addEventListener('change', (e) => {
    const t = e.target;
    if (!t) return;

    // Toggle defaults checkbox
    if (t.matches('input[type="checkbox"][data-action="toggle-defaults"]')) {
      const index = parseInt(t.getAttribute('data-index'));
      const enabled = !!t.checked;
      console.log('[ConfigWebview] toggleProviderDefaults', { index, enabled });
      if (enabled) {
        providers[index].defaults = providers[index].defaults || {};
      } else {
        delete providers[index].defaults;
      }
      renderProviders();
      return;
    }

    // Headers textarea
    if (t.matches('textarea[data-entity="provider"][data-field="headers"]')) {
      const index = parseInt(t.getAttribute('data-index'));
      try {
        const value = t.value;
        if (value.trim() === '') {
          delete providers[index].headers;
        } else {
          providers[index].headers = JSON.parse(value);
        }
      } catch (err) {
        console.error('[ConfigWebview] Invalid JSON for headers:', err);
      }
      return;
    }

    // Provider default fields (supports grouped defaults.model_properties & defaults.model_parameters)
    if (t.matches('[data-entity="provider-default"][data-field]')) {
      const index = parseInt(t.getAttribute('data-index'));
      const field = t.getAttribute('data-field');
      const bucket = t.getAttribute('data-bucket') || 'parameters';
      let value = t.value;
      if (t.type === 'number') {
        value = value === '' ? '' : (t.step && t.step.indexOf('.') >= 0 ? parseFloat(value) : parseInt(value, 10));
      }
      console.log('[ConfigWebview] updateProviderDefault', { index, field, bucket, value });
      if (!providers[index].defaults) providers[index].defaults = { model_properties: {}, model_parameters: {} };
      if (value === '' || (typeof value === 'number' && isNaN(value))) {
        if (bucket === 'properties') delete providers[index].defaults.model_properties[field];
        else delete providers[index].defaults.model_parameters[field];
      } else {
        if (bucket === 'properties') providers[index].defaults.model_properties[field] = value;
        else providers[index].defaults.model_parameters[field] = value;
      }
      return;
    }

    // Provider fields
    if (t.matches('[data-entity="provider"][data-field]')) {
      const index = parseInt(t.getAttribute('data-index'));
      const field = t.getAttribute('data-field');
      let value = t.value;
      if (t.type === 'number') {
        value = value === '' ? '' : parseInt(value, 10);
      }
      console.log('[ConfigWebview] updateProvider', { index, field, value });
      providers[index][field] = value === '' ? undefined : value;
      return;
    }
  });

  // Delegated events for models list
  modelsList.addEventListener('click', (e) => {
    const target = e.target;
    if (!target) return;

    const removeBtn = target.closest && target.closest('button[data-action="remove-model"]');
    if (removeBtn) {
      const index = parseInt(removeBtn.getAttribute('data-index'));
      console.log('[ConfigWebview] removeModel called', { index });
      models.splice(index, 1);
      renderModels();
      return;
    }
  });

  modelsList.addEventListener('change', (e) => {
    const t = e.target;
    if (!t) return;

    if (t.matches('[data-entity="model"][data-field]')) {
      const index = parseInt(t.getAttribute('data-index'));
      const field = t.getAttribute('data-field');
      const bucket = t.getAttribute('data-bucket') || 'properties';
      let value = t.value;
      if (t.type === 'number') {
        value = value === '' ? '' : parseInt(value, 10);
      }
      if (t.type === 'checkbox') {
        value = !!t.checked;
      }
      if (field === 'temperature' || field === 'top_p') {
        value = value === '' ? null : parseFloat(value);
      }
      console.log('[ConfigWebview] updateModel', { index, field, bucket, value });
      // Ensure grouped structure
      if (!models[index].model_properties) models[index].model_properties = {};
      if (!models[index].model_parameters) models[index].model_parameters = {};

      // If this is a JSON textarea field, try to parse JSON and store object
      const jsonFields = ['thinking', 'reasoning', 'extra', 'headers', 'architecture'];
      if (t.tagName === 'TEXTAREA' && jsonFields.indexOf(field) >= 0) {
        try {
          const trimmed = (typeof value === 'string') ? value.trim() : value;
          const parsed = trimmed === '' ? undefined : JSON.parse(trimmed);
          if (bucket === 'properties') {
            if (parsed === undefined) delete models[index].model_properties[field];
            else models[index].model_properties[field] = parsed;
          } else {
            if (parsed === undefined) delete models[index].model_parameters[field];
            else models[index].model_parameters[field] = parsed;
          }
        } catch (err) {
          console.error('[ConfigWebview] Invalid JSON for model field:', field, err);
          // Fall back to storing raw string so user doesn't lose input
          if (bucket === 'properties') models[index].model_properties[field] = value;
          else models[index].model_parameters[field] = value;
        }
        return;
      }

      if (bucket === 'properties') {
        if (value === '' || (typeof value === 'number' && isNaN(value))) {
          delete models[index].model_properties[field];
        } else {
          models[index].model_properties[field] = value === '' ? undefined : value;
        }
      } else {
        if (value === '' || (typeof value === 'number' && isNaN(value))) {
          delete models[index].model_parameters[field];
        } else {
          models[index].model_parameters[field] = value === '' ? undefined : value;
        }
      }
      return;
    }
  });

  function renderProviders() {
    console.log('[ConfigWebview] renderProviders', { count: providers.length });
    const container = providersList;
    if (providers.length === 0) {
      container.innerHTML = '<div class="empty-state">No providers configured. Click "Add Provider" to get started.</div>';
      return;
    }
    container.innerHTML = providers.map((provider, index) => {
      const defaults = provider.defaults || {};
      // support grouped defaults: defaults.model_properties & defaults.model_parameters
      const propDefaults = defaults.model_properties || defaults;
      const paramDefaults = defaults.model_parameters || defaults;
      const defaultsHtml = (provider.defaults ? `
        <div class="collapsible-content">
          <div class="form-group">
            <label>Context Length</label>
            <input data-entity="provider-default" data-bucket="properties" data-index="${index}" data-field="context_length" type="number" value="${propDefaults.context_length ?? ''}">
          </div>
          <div class="form-group">
            <label>Max Tokens</label>
            <input data-entity="provider-default" data-bucket="parameters" data-index="${index}" data-field="max_tokens" type="number" value="${paramDefaults.max_tokens ?? ''}">
          </div>
          <div class="form-group">
            <label>Temperature (0-2)</label>
            <input data-entity="provider-default" data-bucket="parameters" data-index="${index}" data-field="temperature" type="number" step="0.1" value="${paramDefaults.temperature ?? ''}">
          </div>
          <div class="form-group">
            <label>Top P (0-1)</label>
            <input data-entity="provider-default" data-bucket="parameters" data-index="${index}" data-field="top_p" type="number" step="0.1" value="${paramDefaults.top_p ?? ''}">
          </div>
          <div class="form-group">
            <label>Family</label>
            <input data-entity="provider-default" data-bucket="properties" data-index="${index}" data-field="family" type="text" placeholder="e.g., gpt-4, claude-3, gemini" value="${propDefaults.family ?? ''}">
          </div>
          <div class="form-group">
            <label class="checkbox-label">
              <input type="checkbox" data-entity="provider-default" data-bucket="properties" data-field="vision" data-index="${index}" ${propDefaults.vision ? 'checked' : ''}>
              Vision Support
            </label>
          </div>
        </div>` : '');

      return `
        <div class="item">
          <div class="item-header">
            <h3>Provider ${index + 1}</h3>
            <div class="item-actions">
              <button class="secondary" data-action="remove-provider" data-index="${index}">Remove</button>
            </div>
          </div>
          <div class="form-group">
            <label>Key (required) *</label>
            <input data-entity="provider" data-index="${index}" data-field="key" type="text" placeholder="e.g., openai, anthropic" value="${provider.key || ''}">
            <div class="error" style="display: ${!provider.key ? 'block' : 'none'}">Key is required</div>
          </div>
          <div class="form-group">
            <label>Display Name</label>
            <input data-entity="provider" data-index="${index}" data-field="displayName" type="text" value="${provider.displayName || ''}">
          </div>
          <div class="form-group">
            <label>Base URL (required) *</label>
            <input data-entity="provider" data-index="${index}" data-field="baseUrl" type="text" placeholder="e.g., https://api.openai.com/v1" value="${provider.baseUrl || ''}">
            <div class="error" style="display: ${!provider.baseUrl ? 'block' : 'none'}">Base URL is required</div>
          </div>
          <div class="form-group">
            <label>Headers (JSON)</label>
            <textarea rows="3" data-entity="provider" data-index="${index}" data-field="headers" placeholder='{"X-Custom-Header": "value"}'>${provider.headers ? JSON.stringify(provider.headers, null, 2) : ''}</textarea>
          </div>
          <div class="form-group">
            <label class="checkbox-label">
              <input type="checkbox" class="toggle-defaults" data-action="toggle-defaults" data-index="${index}" ${provider.defaults ? 'checked' : ''}>
              Configure Default Parameters
            </label>
          </div>
          ${defaultsHtml}
        </div>`;
    }).join('');
  }

  function renderModels() {
    console.log('[ConfigWebview] renderModels', { count: models.length });
    const container = modelsList;
    if (models.length === 0) {
      container.innerHTML = '<div class="empty-state">No models configured. Click "Add Model" to get started.</div>';
      return;
    }
    const providerOptions = providers.map((p) => {
      const name = (p.displayName || p.key || '').replace(/"/g, '&quot;');
      return `<option value="${p.key}">${name}</option>`;
    }).join('');

    container.innerHTML = models.map((model, index) => {
      // Support either grouped model (model_properties/model_parameters) or legacy flat model
      const props = model.model_properties || model;
      const params = model.model_parameters || {};
      const selProvider = (props && props.provider) || '';
      return `
            <div class="item">
              <div class="item-header">
                <h3>Model ${index + 1}</h3>
                <div class="item-actions">
                  <button class="secondary" data-action="remove-model" data-index="${index}">Remove</button>
                </div>
              </div>

              <div class="collapsible-content">
                <h4>Model properties <small>(internal — not sent to provider)</small></h4>
                <div class="form-group"><em>Model properties are internal metadata used by the extension and are NOT sent to the model provider.</em></div>
                <div class="form-group">
                  <label>Model ID (required) *</label>
                  <input data-entity="model" data-bucket="properties" data-index="${index}" data-field="id" type="text" placeholder="e.g., gpt-4, claude-3-opus" value="${(props && props.id) || ''}">
                  <div class="error" style="display: ${!(props && props.id) ? 'block' : 'none'}">Model ID is required</div>
                </div>
                <div class="form-group">
                  <label>Display Name</label>
                  <input data-entity="model" data-bucket="properties" data-index="${index}" data-field="displayName" type="text" placeholder="Optional human-readable name" value="${(props && props.displayName) || ''}">
                </div>
                <div class="form-group">
                  <label>Provider</label>
                  <select data-entity="model" data-bucket="properties" data-index="${index}" data-field="provider">
                    <option value="">Select a provider</option>
                    ${providerOptions}
                  </select>
                </div>
                <div class="form-group">
                  <label>Owned By</label>
                  <input data-entity="model" data-bucket="properties" data-index="${index}" data-field="owned_by" type="text" placeholder="e.g., openai, anthropic" value="${(props && props.owned_by) || ''}">
                </div>
                <div class="form-group">
                  <label>Config ID</label>
                  <input data-entity="model" data-bucket="properties" data-index="${index}" data-field="configId" type="text" placeholder="Optional: e.g., thinking, fast" value="${(props && props.configId) || ''}">
                </div>
                <div class="form-group">
                  <label>Base URL (override)</label>
                  <input data-entity="model" data-bucket="properties" data-index="${index}" data-field="baseUrl" type="text" placeholder="Leave empty to use provider base URL" value="${(props && props.baseUrl) || ''}">
                </div>
                <div class="form-group">
                  <label>Headers (JSON)</label>
                  <textarea data-entity="model" data-bucket="properties" data-index="${index}" data-field="headers" rows="3" placeholder='{"X-Custom-Header": "value"}'>${(props && props.headers) ? JSON.stringify(props.headers, null, 2) : ''}</textarea>
                </div>
                <div class="form-group">
                  <label>Architecture (JSON)</label>
                  <textarea data-entity="model" data-bucket="properties" data-index="${index}" data-field="architecture" rows="2" placeholder='{"input_modalities":["text","image_url"]}'>${(props && props.architecture) ? JSON.stringify(props.architecture, null, 2) : ''}</textarea>
                </div>

                <div class="form-group">
                  <label>Context Length</label>
                  <input data-entity="model" data-bucket="properties" data-index="${index}" data-field="context_length" type="number" value="${(props && props.context_length) || ''}">
                </div>
                <div class="form-group">
                  <label class="checkbox-label">
                    <input data-entity="model" data-bucket="properties" data-index="${index}" data-field="vision" type="checkbox" ${(props && props.vision) ? 'checked' : ''}>
                    Vision Support
                  </label>
                </div>
              </div>

              <div class="collapsible-content">
                <h4>Model parameters <small>(sent to provider)</small></h4>
                <div class="form-group"><em>Model parameters are sent to the model provider in the request body. Use <code>extra</code> for provider-specific unknown keys (raw JSON). Fields set to <code>null</code> will be omitted from the request to allow provider defaults.</em></div>
                <div class="form-group">
                  <label>Max Tokens</label>
                  <input data-entity="model" data-bucket="parameters" data-index="${index}" data-field="max_tokens" type="number" value="${(params && params.max_tokens) || ''}">
                </div>
                <div class="form-group">
                  <label>Max Completion Tokens</label>
                  <input data-entity="model" data-bucket="parameters" data-index="${index}" data-field="max_completion_tokens" type="number" value="${(params && params.max_completion_tokens) || ''}">
                </div>
                <div class="form-group">
                  <label>Temperature (0-2)</label>
                  <input data-entity="model" data-bucket="parameters" data-index="${index}" data-field="temperature" type="number" step="0.1" value="${((params && params.temperature) != null ? params.temperature : '')}">
                </div>
                <div class="form-group">
                  <label>Top P (0-1)</label>
                  <input data-entity="model" data-bucket="parameters" data-index="${index}" data-field="top_p" type="number" step="0.1" value="${((params && params.top_p) != null ? params.top_p : '')}">
                </div>
                <div class="form-group">
                  <label>Top K</label>
                  <input data-entity="model" data-bucket="parameters" data-index="${index}" data-field="top_k" type="number" value="${(params && params.top_k) || ''}">
                </div>
                <div class="form-group">
                  <label>Min P</label>
                  <input data-entity="model" data-bucket="parameters" data-index="${index}" data-field="min_p" type="number" step="0.01" value="${(params && params.min_p) || ''}">
                </div>
                <div class="form-group">
                  <label>Frequency Penalty</label>
                  <input data-entity="model" data-bucket="parameters" data-index="${index}" data-field="frequency_penalty" type="number" step="0.1" value="${(params && params.frequency_penalty) || ''}">
                </div>
                <div class="form-group">
                  <label>Presence Penalty</label>
                  <input data-entity="model" data-bucket="parameters" data-index="${index}" data-field="presence_penalty" type="number" step="0.1" value="${(params && params.presence_penalty) || ''}">
                </div>
                <div class="form-group">
                  <label>Repetition Penalty</label>
                  <input data-entity="model" data-bucket="parameters" data-index="${index}" data-field="repetition_penalty" type="number" step="0.1" value="${(params && params.repetition_penalty) || ''}">
                </div>
                <div class="form-group">
                  <label>Thinking Budget</label>
                  <input data-entity="model" data-bucket="parameters" data-index="${index}" data-field="thinking_budget" type="number" value="${(params && params.thinking_budget) || ''}">
                </div>
                <div class="form-group">
                  <label>Thinking (JSON)</label>
                  <textarea data-entity="model" data-bucket="parameters" data-index="${index}" data-field="thinking" rows="3" placeholder='{"type":"enabled"}'>${(params && params.thinking) ? JSON.stringify(params.thinking, null, 2) : ''}</textarea>
                </div>
                <div class="form-group">
                  <label>Enable Thinking</label>
                  <label class="checkbox-label">
                    <input data-entity="model" data-bucket="parameters" data-index="${index}" data-field="enable_thinking" type="checkbox" ${(params && params.enable_thinking) ? 'checked' : ''}>
                    Enable thinking features for this model
                  </label>
                </div>
                <div class="form-group">
                  <label>Reasoning (JSON)</label>
                  <textarea data-entity="model" data-bucket="parameters" data-index="${index}" data-field="reasoning" rows="3" placeholder='{"enabled":true,"effort":"high"}'>${(params && params.reasoning) ? JSON.stringify(params.reasoning, null, 2) : ''}</textarea>
                </div>
                <div class="form-group">
                  <label>Reasoning Effort</label>
                  <input data-entity="model" data-bucket="parameters" data-index="${index}" data-field="reasoning_effort" type="text" value="${(params && params.reasoning_effort) || ''}">
                </div>
                <div class="form-group">
                  <label>Extra (JSON)</label>
                  <textarea data-entity="model" data-bucket="parameters" data-index="${index}" data-field="extra" rows="4" placeholder='{"custom_param":"value"}'>${(params && params.extra) ? JSON.stringify(params.extra, null, 2) : ''}</textarea>
                </div>
              </div>
            </div>`;
    }).join('');

    // Set selected provider value for each select
    const selects = container.querySelectorAll('select[data-field="provider"]');
    selects.forEach((sel, i) => {
      const v = (models[i].model_properties && models[i].model_properties.provider) || models[i].provider || '';
      sel.value = v;
    });
  }
})();
