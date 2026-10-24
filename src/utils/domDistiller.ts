import { DistilledElement, TokenTelemetry } from '../types/autoapply';
import { calculateTokenCompression } from './autoapplyEngine';

/**
 * FR 2.3: React/Angular Synthetic Event Bypass
 * Sets the value using the native HTMLInputElement/HTMLTextAreaElement/HTMLSelectElement prototype
 * setter and dispatches bubbling input, change, and blur events so React's internal Fiber state updates.
 */
export function setNativeValue(element: HTMLElement, value: string): void {
  const tagName = element.tagName.toLowerCase();
  let prototype: object = window.HTMLInputElement.prototype;

  if (tagName === 'textarea') {
    prototype = window.HTMLTextAreaElement.prototype;
  } else if (tagName === 'select') {
    prototype = window.HTMLSelectElement.prototype;
  }

  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
  if (descriptor && descriptor.set) {
    descriptor.set.call(element, value);
  } else {
    (element as HTMLInputElement).value = value;
  }

  // Mark element so the MockATS Torture-Chamber can verify that synthetic event injection was used
  element.setAttribute('data-synthetic-injected', 'true');

  element.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  element.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  element.dispatchEvent(new Event('blur', { bubbles: true, composed: true }));
}

/**
 * Toggles a checkbox or radio input via native click + synthetic change event
 */
export function setNativeChecked(element: HTMLInputElement, checked: boolean): void {
  element.setAttribute('data-synthetic-injected', 'true');
  if (element.checked !== checked) {
    element.click();
  }
  const descriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'checked');
  if (descriptor && descriptor.set && element.checked !== checked) {
    descriptor.set.call(element, checked);
    element.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    element.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  }
}

/**
 * FR 2.4: Automated Resume File Upload via DataTransfer API
 */
export function injectCachedPdfFile(
  fileInput: HTMLInputElement,
  base64Pdf: string,
  fileName: string
): boolean {
  try {
    const binaryString = window.atob(base64Pdf);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const file = new File([blob], fileName, {
      type: 'application/pdf',
      lastModified: Date.now(),
    });

    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    fileInput.files = dataTransfer.files;
    fileInput.setAttribute('data-synthetic-injected', 'true');

    fileInput.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    fileInput.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    return true;
  } catch (err) {
    console.error('DataTransfer injection error:', err);
    return false;
  }
}

/**
 * Recursively traverses a root node (Document, Element, or ShadowRoot)
 * including open Shadow DOMs (FR 2.1 & Page 4 Shadow DOM Trap).
 */
export function collectInteractiveElements(
  root: Document | Element | ShadowRoot,
  inShadowDom = false,
  collected: Array<{ el: HTMLElement; inShadowDom: boolean }> = []
): Array<{ el: HTMLElement; inShadowDom: boolean }> {
  const children = Array.from(root.querySelectorAll('*'));

  for (const node of children) {
    const htmlEl = node as HTMLElement;
    const tag = htmlEl.tagName.toLowerCase();
    const role = htmlEl.getAttribute('role');

    // Skip elements explicitly ignored by distiller (e.g., navigation tabs outside form)
    if (htmlEl.getAttribute('data-distiller-ignore') === 'true') {
      continue;
    }

    const isInteractive =
      tag === 'input' ||
      tag === 'select' ||
      tag === 'textarea' ||
      tag === 'button' ||
      role === 'combobox' ||
      role === 'listbox';

    if (isInteractive) {
      collected.push({ el: htmlEl, inShadowDom });
    }

    // Recursively traverse open Shadow Root!
    if (htmlEl.shadowRoot) {
      collectInteractiveElements(htmlEl.shadowRoot, true, collected);
    }
  }

  return collected;
}

/**
 * Finds an element by its data-autoapply-id across both standard DOM and open Shadow Roots
 */
export function findElementByAgentId(
  root: Document | Element | ShadowRoot,
  agentId: string
): HTMLElement | null {
  const direct = root.querySelector(`[data-autoapply-id="${agentId}"]`) as HTMLElement | null;
  if (direct) return direct;

  const allNodes = Array.from(root.querySelectorAll('*'));
  for (const node of allNodes) {
    if (node.shadowRoot) {
      const foundInShadow = findElementByAgentId(node.shadowRoot, agentId);
      if (foundInShadow) return foundInShadow;
    }
  }
  return null;
}

/**
 * Extracts a human-readable label for a form control inside standard or Shadow DOM.
 */
function resolveElementLabel(el: HTMLElement, rootContext: Document | Element | ShadowRoot): string {
  const explicitLabel = el.getAttribute('data-label') || el.getAttribute('aria-label');
  if (explicitLabel) return explicitLabel.trim();

  const id = el.getAttribute('id');
  if (id) {
    const labelFor = rootContext.querySelector(`label[for="${id}"]`);
    if (labelFor && labelFor.textContent) {
      return labelFor.textContent.trim();
    }
  }

  const parentLabel = el.closest('label');
  if (parentLabel && parentLabel.textContent) {
    return parentLabel.textContent.trim();
  }

  const container = el.closest('[data-field-wrapper]');
  if (container) {
    const heading = container.querySelector('label, .field-label');
    if (heading && heading.textContent) {
      return heading.textContent.trim();
    }
  }

  if (el.tagName.toLowerCase() === 'button') {
    return (el.textContent || '').trim();
  }

  return el.getAttribute('name') || el.getAttribute('placeholder') || 'Unnamed Control';
}

/**
 * FR 2.1 & FR 2.2: Live DOM Distillation & Agent ID Tagging
 * Traverses the target container, tags every interactive element with data-autoapply-id="el_N",
 * and constructs a lightweight JSON schema + token compression telemetry.
 */
export function distillLiveDom(containerSelector = '#mock-ats-form-container'): {
  elements: DistilledElement[];
  telemetry: TokenTelemetry;
} {
  const startTime = performance.now();
  const container = document.querySelector(containerSelector) || document.body;

  const interactiveNodes = collectInteractiveElements(container, false);
  const distilled: DistilledElement[] = [];
  let shadowCount = 0;

  interactiveNodes.forEach(({ el, inShadowDom }, index) => {
    const agentId = `el_${index + 1}`;
    el.setAttribute('data-autoapply-id', agentId);
    if (inShadowDom) shadowCount++;

    const tag = el.tagName.toLowerCase();
    const inputEl = el as HTMLInputElement;
    const selectEl = el as HTMLSelectElement;

    const rootNode = el.getRootNode() as Document | ShadowRoot;
    const label = resolveElementLabel(el, rootNode || container);

    let options: string[] | null = null;
    if (tag === 'select') {
      options = Array.from(selectEl.options).map((opt) => opt.value || opt.text);
    } else if (el.getAttribute('data-options')) {
      options = (el.getAttribute('data-options') || '').split('|');
    }

    distilled.push({
      agent_id: agentId,
      tag,
      type: inputEl.type || tag,
      name: el.getAttribute('name') || undefined,
      label,
      placeholder: el.getAttribute('placeholder') || '',
      options,
      current_value: inputEl.value || '',
      checked: inputEl.type === 'checkbox' || inputEl.type === 'radio' ? inputEl.checked : undefined,
      is_readonly: el.hasAttribute('readonly') || el.getAttribute('data-readonly-trap') === 'true',
      in_shadow_dom: inShadowDom,
      aria_invalid: el.getAttribute('aria-invalid') === 'true',
      aria_expanded: el.getAttribute('aria-expanded'),
      role: el.getAttribute('role'),
    });
  });

  const rawHtmlBytes = container.innerHTML.length;
  const distilledJsonString = JSON.stringify(distilled, null, 2);
  const distilledJsonBytes = distilledJsonString.length;
  const latencyMs = Math.max(12, Math.round(performance.now() - startTime));

  const telemetry = calculateTokenCompression(
    rawHtmlBytes,
    distilledJsonBytes,
    distilled.length,
    shadowCount,
    latencyMs
  );

  return { elements: distilled, telemetry };
}
