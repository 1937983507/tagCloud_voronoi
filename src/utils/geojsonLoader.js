let cachedGeojson = null;

const extractJsonFromText = (text) => {
  try {
    return JSON.parse(text);
  } catch (jsonError) {
    const trimmed = text.trim();
    const assignmentRegex = /^(?:const|let|var)\s+geojson\s*=\s*/;
    let candidate = trimmed.replace(assignmentRegex, '').trim();
    if (candidate.endsWith(';')) {
      candidate = candidate.slice(0, -1).trim();
    }
    try {
      return JSON.parse(candidate);
    } catch (assignmentError) {
      // 作为最后手段尝试执行脚本
      eval(trimmed);
      if (window.geojson) {
        return window.geojson;
      }
      throw new Error('无法解析geojson数据');
    }
  }
};

export const loadGeoJson = async () => {
  if (cachedGeojson) return cachedGeojson;
  const response = await fetch('/data/shi.js');
  if (!response.ok) {
    throw new Error(`geojson加载失败：${response.status}`);
  }
  const text = await response.text();
  const jsonData = extractJsonFromText(text);
  cachedGeojson = jsonData;
  window.geojson = jsonData;
  return jsonData;
};

