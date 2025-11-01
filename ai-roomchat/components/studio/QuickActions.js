import { DEFAULT_TEMPLATE, DEFAULT_TEMPLATE_OBJECT } from '../../contexts/PersistentTemplateProvider.jsx';
import { useTemplate } from '../../contexts/TemplateStore';

export default function QuickActions(){
  const { templateText, setTemplateText } = useTemplate();

  const resetTemplate = () => {
    if (confirm('템플릿을 기본값으로 초기화할까요? 현재 내용은 사라집니다.')) {
      setTemplateText(DEFAULT_TEMPLATE);
    }
  };

  const addRuntimeStub = () => {
    try {
      const obj = JSON.parse(templateText || '{}');
      const next = { ...DEFAULT_TEMPLATE_OBJECT, ...obj, runtime: { ...obj.runtime, code: obj.runtime?.code || `// 런타임 실행 스텁\n// 템플릿과 로그 함수를 받아 실행합니다.\nfunction run(template, log){\n  log('runtime run: nodes=' + (template.nodes?.length||0));\n  // TODO: 여기에 게임 로직을 작성하세요.\n}\n` } };
      setTemplateText(JSON.stringify(next, null, 2));
    } catch {
      // ignore
    }
  };

  return (
    <div style={{ display:'flex', gap:8 }}>
      <button onClick={resetTemplate}>Reset</button>
      <button onClick={addRuntimeStub}>Add runtime stub</button>
    </div>
  );
}

