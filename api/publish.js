const OWNER = "arliu633-glitch";
const REPO = "hb-price-chart-public";
const BRANCH = "master";
const CHART_PATH = "chart.svg";

export default async function handler(request, response) {
  if (request.method !== "POST") {
    return response.status(405).json({ ok: false, message: "Method not allowed" });
  }

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return response.status(500).json({ ok: false, message: "发布服务未配置 GitHub token。" });
  }

  try {
    const svg = String(request.body?.svg || "");
    if (!svg.startsWith("<svg") || !svg.includes("</svg>")) {
      return response.status(400).json({ ok: false, message: "图表 SVG 内容无效。" });
    }

    const result = await updateChart(svg, token);
    return response.status(200).json({ ok: true, commit: result.commit?.sha || "" });
  } catch (error) {
    return response.status(500).json({ ok: false, message: error.message || "发布失败。" });
  }
}

async function updateChart(svg, token) {
  const apiUrl = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${CHART_PATH}`;
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "User-Agent": "hb-price-chart-publisher",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  const currentResponse = await fetch(`${apiUrl}?ref=${BRANCH}`, { headers });
  if (!currentResponse.ok) {
    throw new Error("读取公开仓库失败。");
  }
  const currentFile = await currentResponse.json();

  const updateResponse = await fetch(apiUrl, {
    method: "PUT",
    headers: {
      ...headers,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: "Update published chart",
      content: base64EncodeUtf8(svg),
      sha: currentFile.sha,
      branch: BRANCH,
    }),
  });

  const result = await updateResponse.json().catch(() => ({}));
  if (!updateResponse.ok) {
    throw new Error(result.message || "写入公开仓库失败。");
  }
  return result;
}

function base64EncodeUtf8(value) {
  return Buffer.from(value, "utf8").toString("base64");
}
