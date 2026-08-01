function formatShanghaiDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function handler(request, response) {
  if (request.method !== "GET") {
    return response.status(405).json({ ok: false, message: "Method not allowed" });
  }

  return response.status(200).json({
    ok: true,
    currentDate: formatShanghaiDate(),
  });
}

module.exports = handler;
module.exports.default = handler;
module.exports.formatShanghaiDate = formatShanghaiDate;
