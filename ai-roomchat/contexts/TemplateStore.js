
import React, { createContext, useContext, useState, useEffect } from 'react';
import { loadTemplate, saveTemplate } from '../lib/templateStore';
import { validateTemplate } from '../lib/validator';
import basicTemplate from '../../public/templates/basic-game.json';

const TemplateContext = createContext();

export const useTemplate = () => useContext(TemplateContext);

export const TemplateProvider = ({ children }) => {
  const [template, setTemplate] = useState(null);
  const [validationResult, setValidationResult] = useState({ ok: true, errors: [] });
  const [activeEditor, setActiveEditor] = useState('code'); // 'code', 'node', 'ui'

  useEffect(() => {
    // Load initial template from localStorage or use the basic one
    const loadedTemplate = loadTemplate('template:current');
    const initialTemplate = loadedTemplate || basicTemplate;
    setTemplate(initialTemplate);
    validateAndSet(initialTemplate);
  }, []);

  const validateAndSet = (newTemplate) => {
    const result = validateTemplate(newTemplate);
    setValidationResult(result);
    setTemplate(newTemplate);
  };

  const updateTemplate = (newTemplate) => {
    validateAndSet(newTemplate);
    saveTemplate('template:current', newTemplate);
  };

  const value = {
    template,
    updateTemplate,
    validationResult,
    activeEditor,
    setActiveEditor,
  };

  return (
    <TemplateContext.Provider value={value}>
      {children}
    </TemplateContext.Provider>
  );
};
