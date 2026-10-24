import React, { useEffect, useRef } from 'react';

interface ShadowEeoWidgetProps {
  gender: string;
  disability: string;
  termsAccepted: boolean;
  onChange: (updates: {
    gender?: string;
    disability?: string;
    termsAccepted?: boolean;
  }) => void;
}

/**
 * Part 2, Page 4 Specification:
 * Embeds the Equal Employment Opportunity (EEO) section (Gender, Disability status,
 * Terms & Conditions checkbox) inside a real open Shadow DOM (element.attachShadow({ mode: 'open' })).
 * Standard document.querySelectorAll('input, select') cannot see inside this boundary,
 * proving that the DOM Distiller performs recursive Shadow Root traversal.
 */
export const ShadowEeoWidget: React.FC<ShadowEeoWidgetProps> = ({
  gender,
  disability,
  termsAccepted,
  onChange,
}) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const shadowRoot = host.shadowRoot || host.attachShadow({ mode: 'open' });

    shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
        }
        .shadow-container {
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          background: #f8fafc;
          padding: 18px;
        }
        .shadow-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 14px;
          padding-bottom: 10px;
          border-bottom: 1px solid #e2e8f0;
        }
        .shadow-title {
          font-size: 14px;
          font-weight: 600;
          color: #0f172a;
          margin: 0;
        }
        .shadow-meta {
          font-family: 'JetBrains Mono', monospace;
          font-size: 11px;
          color: #475569;
        }
        .field-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
          margin-bottom: 14px;
        }
        @media (max-width: 640px) {
          .field-grid {
            grid-template-columns: 1fr;
          }
        }
        .field-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        label.field-label {
          font-size: 12px;
          font-weight: 600;
          color: #334155;
        }
        select {
          appearance: auto;
          width: 100%;
          padding: 8px 10px;
          font-size: 13px;
          color: #0f172a;
          background-color: #ffffff;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          outline: none;
        }
        select:focus {
          border-color: #2563eb;
          box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.15);
        }
        .checkbox-row {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          padding-top: 8px;
          border-top: 1px solid #e2e8f0;
        }
        .checkbox-row input[type="checkbox"] {
          width: 16px;
          height: 16px;
          margin-top: 2px;
          accent-color: #2563eb;
          cursor: pointer;
        }
        .checkbox-row label {
          font-size: 13px;
          color: #1e293b;
          line-height: 1.4;
          cursor: pointer;
        }
        [data-autoapply-id] {
          transition: box-shadow 150ms ease, border-color 150ms ease;
        }
      </style>
      <div class="shadow-container">
        <div class="shadow-header">
          <h4 class="shadow-title">Equal Employment Opportunity (EEO) & Compliance</h4>
          <span class="shadow-meta">#shadow-root (open) · attachShadow({ mode: 'open' })</span>
        </div>
        <div class="field-grid">
          <div class="field-group" data-field-wrapper="true">
            <label class="field-label" for="shadow-eeo-gender">Gender Identity (EEO) *</label>
            <select id="shadow-eeo-gender" name="eeo_gender" data-label="Gender Identity (EEO) *">
              <option value="">Select Gender Identity...</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Non-Binary">Non-Binary</option>
              <option value="Prefer not to disclose">Prefer not to disclose</option>
            </select>
          </div>
          <div class="field-group" data-field-wrapper="true">
            <label class="field-label" for="shadow-eeo-disability">Disability Status (EEO) *</label>
            <select id="shadow-eeo-disability" name="eeo_disability" data-label="Disability Status (EEO) *">
              <option value="">Select Disability Status...</option>
              <option value="No, I do not have a disability">No, I do not have a disability</option>
              <option value="Yes, I have a disability">Yes, I have a disability</option>
              <option value="I do not wish to answer">I do not wish to answer</option>
            </select>
          </div>
        </div>
        <div class="checkbox-row" data-field-wrapper="true">
          <input
            type="checkbox"
            id="shadow-eeo-terms"
            name="eeo_terms"
            data-label="I certify that all application responses are accurate and accept the EEO Terms & Conditions *"
          />
          <label for="shadow-eeo-terms">
            I certify that all application responses are accurate and accept the EEO Terms & Conditions *
          </label>
        </div>
      </div>
    `;

    const genderSelect = shadowRoot.getElementById('shadow-eeo-gender') as HTMLSelectElement | null;
    const disabilitySelect = shadowRoot.getElementById(
      'shadow-eeo-disability'
    ) as HTMLSelectElement | null;
    const termsCheckbox = shadowRoot.getElementById('shadow-eeo-terms') as HTMLInputElement | null;

    if (genderSelect) genderSelect.value = gender;
    if (disabilitySelect) disabilitySelect.value = disability;
    if (termsCheckbox) termsCheckbox.checked = termsAccepted;

    const handleGenderChange = () => {
      if (genderSelect) {
        onChangeRef.current({ gender: genderSelect.value });
      }
    };
    const handleDisabilityChange = () => {
      if (disabilitySelect) {
        onChangeRef.current({ disability: disabilitySelect.value });
      }
    };
    const handleTermsChange = () => {
      if (termsCheckbox) {
        onChangeRef.current({ termsAccepted: termsCheckbox.checked });
      }
    };

    genderSelect?.addEventListener('change', handleGenderChange);
    genderSelect?.addEventListener('input', handleGenderChange);
    disabilitySelect?.addEventListener('change', handleDisabilityChange);
    disabilitySelect?.addEventListener('input', handleDisabilityChange);
    termsCheckbox?.addEventListener('change', handleTermsChange);
    termsCheckbox?.addEventListener('input', handleTermsChange);

    return () => {
      genderSelect?.removeEventListener('change', handleGenderChange);
      genderSelect?.removeEventListener('input', handleGenderChange);
      disabilitySelect?.removeEventListener('change', handleDisabilityChange);
      disabilitySelect?.removeEventListener('input', handleDisabilityChange);
      termsCheckbox?.removeEventListener('change', handleTermsChange);
      termsCheckbox?.removeEventListener('input', handleTermsChange);
    };
  }, []);

  // Keep shadow inputs synced when external state changes
  useEffect(() => {
    const shadowRoot = hostRef.current?.shadowRoot;
    if (!shadowRoot) return;

    const genderSelect = shadowRoot.getElementById('shadow-eeo-gender') as HTMLSelectElement | null;
    const disabilitySelect = shadowRoot.getElementById(
      'shadow-eeo-disability'
    ) as HTMLSelectElement | null;
    const termsCheckbox = shadowRoot.getElementById('shadow-eeo-terms') as HTMLInputElement | null;

    if (genderSelect && genderSelect.value !== gender) {
      genderSelect.value = gender;
    }
    if (disabilitySelect && disabilitySelect.value !== disability) {
      disabilitySelect.value = disability;
    }
    if (termsCheckbox && termsCheckbox.checked !== termsAccepted) {
      termsCheckbox.checked = termsAccepted;
    }
  }, [gender, disability, termsAccepted]);

  return <div ref={hostRef} id="eeo-shadow-host" className="w-full" />;
};
