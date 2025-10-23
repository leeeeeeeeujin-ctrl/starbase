/**
 * 🎨 이미지 기반 UI 생성기
 * 스케치, 와이어프레임, 스크린샷을 AI가 UI 코드로 변환
 */

'use client';

import { useState, useRef } from 'react';
import { IntegratedGameEngine } from '../../../services/IntegratedGameEngine';

const ImageToUIGenerator = ({ onUIGenerated, onClose }) => {
  const [selectedImage, setSelectedImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [generatedUI, setGeneratedUI] = useState(null);
  const [analysisResults, setAnalysisResults] = useState(null);

  const fileInputRef = useRef(null);
  const canvasRef = useRef(null);

  const [gameEngine] = useState(
    () =>
      new IntegratedGameEngine({
        enableSecureAI: true,
        debugMode: true,
      })
  );

  // 이미지 파일 선택 핸들러
  const handleImageSelect = event => {
    const file = event.target.files[0];
    if (file && file.type.startsWith('image/')) {
      setSelectedImage(file);

      // 이미지 미리보기 생성
      const reader = new FileReader();
      reader.onload = e => {
        setImagePreview(e.target.result);
        analyzeImageLayout(e.target.result);
      };
      reader.readAsDataURL(file);
    }
  };

  // 이미지 레이아웃 분석 (클라이언트 사이드)
  const analyzeImageLayout = imageDataUrl => {
    const img = new Image();
    img.onload = () => {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');

      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      // 간단한 색상/영역 분석
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const analysis = performBasicImageAnalysis(imageData, img.width, img.height);

      setAnalysisResults(analysis);
    };
    img.src = imageDataUrl;
  };

  // 기본 이미지 분석 (색상, 영역 감지)
  const performBasicImageAnalysis = (imageData, width, height) => {
    const data = imageData.data;
    const regions = [];
    const colors = new Map();

    // 색상 히스토그램 생성
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const colorKey = `${Math.floor(r / 32)}-${Math.floor(g / 32)}-${Math.floor(b / 32)}`;

      colors.set(colorKey, (colors.get(colorKey) || 0) + 1);
    }

    // 주요 색상 추출 (상위 5개)
    const sortedColors = Array.from(colors.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([key, count]) => {
        const [r, g, b] = key.split('-').map(n => parseInt(n) * 32);
        return { r, g, b, count, percentage: ((count / (width * height)) * 100).toFixed(1) };
      });

    // 간단한 영역 감지 (밝은 영역 vs 어두운 영역)
    const brightness = [];
    for (let y = 0; y < height; y += 10) {
      for (let x = 0; x < width; x += 10) {
        const i = (y * width + x) * 4;
        const gray = (data[i] + data[i + 1] + data[i + 2]) / 3;
        brightness.push({ x, y, brightness: gray });
      }
    }

    // 밝기 기반 영역 분류
    const brightRegions = brightness.filter(p => p.brightness > 200);
    const darkRegions = brightness.filter(p => p.brightness < 100);

    return {
      dimensions: { width, height },
      dominantColors: sortedColors,
      brightRegions: brightRegions.length,
      darkRegions: darkRegions.length,
      totalPixels: width * height,
      aspectRatio: (width / height).toFixed(2),
    };
  };

  // AI로 UI 생성
  const generateUIWithAI = async () => {
    if (!selectedImage || !analysisResults) return;

    setIsProcessing(true);

    try {
      // 이미지를 base64로 변환
      const imageBase64 = imagePreview;

      // AI에게 전달할 프롬프트 구성
      const aiPrompt = `
이미지 기반 UI 생성 요청:

이미지 분석 결과:
- 크기: ${analysisResults.dimensions.width}x${analysisResults.dimensions.height}
- 화면비: ${analysisResults.aspectRatio}
- 주요 색상들: ${analysisResults.dominantColors.map(c => `RGB(${c.r},${c.g},${c.b}) - ${c.percentage}%`).join(', ')}
- 밝은 영역: ${analysisResults.brightRegions}개
- 어두운 영역: ${analysisResults.darkRegions}개

첨부된 이미지(와이어프레임, 스케치, 또는 UI 디자인)를 분석하여 다음을 생성해주세요:

1. 📋 **UI 구성 요소 분석**
   - 버튼, 입력 필드, 텍스트, 이미지 영역 등 식별
   - 각 요소의 대략적인 위치와 크기

2. 💻 **React 컴포넌트 코드**
   - 분석한 UI 구조를 React JSX로 구현
   - inline style 사용 (CSS 모듈 없이)
   - 게임 UI에 적합한 인터랙티브 요소 포함

3. 🎨 **스타일 가이드**
   - 감지된 색상 팔레트 활용
   - 적절한 여백, 크기, 글꼴 설정

4. ⚡ **기능 제안**
   - UI 요소들이 게임에서 어떤 역할을 할 수 있는지
   - 클릭, 호버 등 인터랙션 제안

응답 형식:
\`\`\`jsx
// 생성된 UI 컴포넌트
const GeneratedUI = () => {
  return (
    <div>
      {/* UI 코드 */}
    </div>
  )
}
\`\`\`

이미지를 최대한 정확하게 재현하되, 게임 UI로서 실용적이고 아름다운 디자인을 만들어주세요!`;

      // AI 요청 (이미지 포함)
      const response = await gameEngine.generateCode(aiPrompt, {
        type: 'image_to_ui',
        imageData: imageBase64,
        analysis: analysisResults,
      });

      setGeneratedUI(response);
    } catch (error) {
      console.error('UI 생성 오류:', error);
      alert('UI 생성 중 오류가 발생했습니다: ' + error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  // 생성된 UI 적용
  const applyGeneratedUI = () => {
    if (generatedUI && onUIGenerated) {
      onUIGenerated({
        type: 'ui_component',
        code: generatedUI,
        source: 'image_analysis',
        imageAnalysis: analysisResults,
        originalImage: imagePreview,
      });
    }
    onClose();
  };

  // 드래그 앤 드롭 핸들러
  const handleDragOver = e => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = e => {
    e.preventDefault();
    e.stopPropagation();

    const files = Array.from(e.dataTransfer.files);
    const imageFile = files.find(file => file.type.startsWith('image/'));

    if (imageFile) {
      setSelectedImage(imageFile);

      const reader = new FileReader();
      reader.onload = e => {
        setImagePreview(e.target.result);
        analyzeImageLayout(e.target.result);
      };
      reader.readAsDataURL(imageFile);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.9)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        backdropFilter: 'blur(10px)',
      }}
    >
      <div
        style={{
          background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #1e40af 100%)',
          borderRadius: 24,
          padding: 0,
          width: '95vw',
          height: '90vh',
          maxWidth: 1400,
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          border: '1px solid rgba(255, 255, 255, 0.1)',
        }}
      >
        {/* 헤더 */}
        <div
          style={{
            padding: '24px 32px',
            background: 'rgba(255, 255, 255, 0.05)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <h1
              style={{
                margin: 0,
                color: '#ffffff',
                fontSize: 24,
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}
            >
              🎨 이미지 → UI 생성기
            </h1>
            <p
              style={{
                margin: '4px 0 0 0',
                color: '#cbd5e1',
                fontSize: 14,
              }}
            >
              스케치나 와이어프레임을 업로드하면 AI가 UI 컴포넌트로 변환해드립니다
            </p>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.1)',
              border: 'none',
              borderRadius: 12,
              color: '#ffffff',
              padding: '8px 16px',
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            ✕ 닫기
          </button>
        </div>

        <div
          style={{
            flex: 1,
            display: 'grid',
            gridTemplateColumns: selectedImage ? '1fr 1fr' : '1fr',
            gap: 24,
            padding: '24px 32px',
          }}
        >
          {/* 이미지 업로드 영역 */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}
          >
            <h2
              style={{
                margin: 0,
                color: '#ffffff',
                fontSize: 18,
                fontWeight: 700,
              }}
            >
              📸 이미지 업로드
            </h2>

            {!selectedImage ? (
              <div
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  flex: 1,
                  border: '2px dashed rgba(255, 255, 255, 0.3)',
                  borderRadius: 16,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  background: 'rgba(255, 255, 255, 0.05)',
                  transition: 'all 0.3s ease',
                  minHeight: 300,
                }}
              >
                <div
                  style={{
                    fontSize: 48,
                    color: 'rgba(255, 255, 255, 0.6)',
                    marginBottom: 16,
                  }}
                >
                  🖼️
                </div>
                <p
                  style={{
                    color: '#ffffff',
                    fontSize: 18,
                    fontWeight: 600,
                    margin: '0 0 8px 0',
                    textAlign: 'center',
                  }}
                >
                  이미지를 드래그하거나 클릭하여 업로드
                </p>
                <p
                  style={{
                    color: '#cbd5e1',
                    fontSize: 14,
                    margin: 0,
                    textAlign: 'center',
                  }}
                >
                  지원 형식: PNG, JPG, GIF, WebP
                  <br />
                  와이어프레임, 스케치, UI 디자인 등
                </p>
              </div>
            ) : (
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 16,
                }}
              >
                {/* 이미지 미리보기 */}
                <div
                  style={{
                    background: 'rgba(255, 255, 255, 0.1)',
                    borderRadius: 12,
                    padding: 16,
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                  }}
                >
                  <img
                    src={imagePreview}
                    alt="업로드된 이미지"
                    style={{
                      maxWidth: '100%',
                      maxHeight: 200,
                      objectFit: 'contain',
                      borderRadius: 8,
                    }}
                  />
                </div>

                {/* 이미지 분석 결과 */}
                {analysisResults && (
                  <div
                    style={{
                      background: 'rgba(255, 255, 255, 0.05)',
                      borderRadius: 12,
                      padding: 16,
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                    }}
                  >
                    <h3
                      style={{
                        margin: '0 0 12px 0',
                        color: '#ffffff',
                        fontSize: 14,
                        fontWeight: 600,
                      }}
                    >
                      📊 이미지 분석
                    </h3>
                    <div style={{ fontSize: 12, color: '#cbd5e1', lineHeight: 1.5 }}>
                      <p>
                        크기: {analysisResults.dimensions.width} ×{' '}
                        {analysisResults.dimensions.height}
                      </p>
                      <p>화면비: {analysisResults.aspectRatio}</p>
                      <p>
                        주요 색상:{' '}
                        {analysisResults.dominantColors
                          .slice(0, 3)
                          .map(c => `RGB(${c.r},${c.g},${c.b})`)
                          .join(', ')}
                      </p>
                    </div>
                  </div>
                )}

                {/* 액션 버튼들 */}
                <div
                  style={{
                    display: 'flex',
                    gap: 12,
                    flexWrap: 'wrap',
                  }}
                >
                  <button
                    onClick={generateUIWithAI}
                    disabled={isProcessing}
                    style={{
                      flex: 1,
                      background: isProcessing
                        ? 'rgba(139, 92, 246, 0.5)'
                        : 'linear-gradient(135deg, #8b5cf6 0%, #06b6d4 100%)',
                      border: 'none',
                      borderRadius: 12,
                      color: '#ffffff',
                      padding: '12px 20px',
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: isProcessing ? 'not-allowed' : 'pointer',
                      boxShadow: isProcessing ? 'none' : '0 4px 12px rgba(139, 92, 246, 0.4)',
                    }}
                  >
                    {isProcessing ? '🤖 AI 분석 중...' : '🚀 AI로 UI 생성'}
                  </button>

                  <button
                    onClick={() => {
                      setSelectedImage(null);
                      setImagePreview(null);
                      setGeneratedUI(null);
                      setAnalysisResults(null);
                    }}
                    style={{
                      background: 'rgba(255, 255, 255, 0.1)',
                      border: '1px solid rgba(255, 255, 255, 0.2)',
                      borderRadius: 12,
                      color: '#ffffff',
                      padding: '12px 16px',
                      fontSize: 14,
                      cursor: 'pointer',
                    }}
                  >
                    🔄 다시 선택
                  </button>
                </div>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageSelect}
              style={{ display: 'none' }}
            />
          </div>

          {/* 생성된 UI 미리보기 */}
          {selectedImage && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 16,
              }}
            >
              <h2
                style={{
                  margin: 0,
                  color: '#ffffff',
                  fontSize: 18,
                  fontWeight: 700,
                }}
              >
                ✨ 생성된 UI
              </h2>

              {!generatedUI ? (
                <div
                  style={{
                    flex: 1,
                    border: '2px dashed rgba(255, 255, 255, 0.2)',
                    borderRadius: 16,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'rgba(255, 255, 255, 0.03)',
                    minHeight: 300,
                  }}
                >
                  <div style={{ textAlign: 'center' }}>
                    <div
                      style={{
                        fontSize: 32,
                        color: 'rgba(255, 255, 255, 0.4)',
                        marginBottom: 12,
                      }}
                    >
                      🎨
                    </div>
                    <p
                      style={{
                        color: '#9ca3af',
                        fontSize: 14,
                        margin: 0,
                      }}
                    >
                      AI가 UI를 생성하면 여기에 표시됩니다
                    </p>
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 16,
                  }}
                >
                  {/* 생성된 코드 표시 */}
                  <div
                    style={{
                      background: 'rgba(0, 0, 0, 0.3)',
                      borderRadius: 12,
                      padding: 16,
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      maxHeight: 300,
                      overflowY: 'auto',
                    }}
                  >
                    <pre
                      style={{
                        margin: 0,
                        color: '#e2e8f0',
                        fontSize: 11,
                        lineHeight: 1.4,
                        whiteSpace: 'pre-wrap',
                        fontFamily: 'Monaco, Consolas, monospace',
                      }}
                    >
                      {generatedUI}
                    </pre>
                  </div>

                  {/* 적용 버튼 */}
                  <button
                    onClick={applyGeneratedUI}
                    style={{
                      background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                      border: 'none',
                      borderRadius: 12,
                      color: '#ffffff',
                      padding: '12px 20px',
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: 'pointer',
                      boxShadow: '0 4px 12px rgba(34, 197, 94, 0.4)',
                    }}
                  >
                    ✅ 게임에 UI 적용하기
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 숨겨진 캔버스 (이미지 분석용) */}
        <canvas ref={canvasRef} style={{ display: 'none' }} />
      </div>
    </div>
  );
};

export default ImageToUIGenerator;
