export const dynamic = "force-static";

const SWAGGER_UI_VERSION = "5.18.2";

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>NeoBoard API Docs</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@${SWAGGER_UI_VERSION}/swagger-ui.css" />
  <style>
    html { box-sizing: border-box; overflow-y: scroll; }
    *, *::before, *::after { box-sizing: inherit; }
    body { margin: 0; background: #fafafa; }
    .swagger-ui .topbar { background-color: #0f172a; }
    .swagger-ui .topbar .download-url-wrapper { display: none; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@${SWAGGER_UI_VERSION}/swagger-ui-bundle.js"></script>
  <script src="https://unpkg.com/swagger-ui-dist@${SWAGGER_UI_VERSION}/swagger-ui-standalone-preset.js"></script>
  <script>
    window.onload = function () {
      SwaggerUIBundle({
        url: "/api/openapi.json",
        dom_id: "#swagger-ui",
        presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
        layout: "StandaloneLayout",
        deepLinking: true,
        tryItOutEnabled: true,
        persistAuthorization: true,
        requestInterceptor: function (request) {
          // Strip cookies from try-it-out requests so API key auth can be tested cleanly
          request.credentials = "omit";
          return request;
        },
      });
    };
  </script>
</body>
</html>`;

export function GET() {
  return new Response(HTML, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
