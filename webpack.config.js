const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const CopyWebpackPlugin = require("copy-webpack-plugin");
const devCerts = require("office-addin-dev-certs");

// Origins are compared without a trailing slash. The manifest writes the
// origin both with a path ("…/taskpane.html") and bare (in <AppDomain>), and a
// trailing slash here would silently miss the bare one — leaving a production
// manifest pointing at localhost.
const DEV_ORIGIN = "https://localhost:3000";
const PROD_ORIGIN = (process.env.ADDIN_BASE_URL || DEV_ORIGIN).replace(/\/+$/, "");

async function getHttpsOptions() {
  const httpsOptions = await devCerts.getHttpsServerOptions();
  return { ca: httpsOptions.ca, key: httpsOptions.key, cert: httpsOptions.cert };
}

module.exports = async (env, options) => {
  const dev = options.mode === "development";

  return {
    devtool: "source-map",
    entry: {
      polyfill: ["core-js/stable"],
      taskpane: "./src/taskpane/taskpane.ts",
      commands: "./src/commands/commands.ts",
      preview: "./src/preview/preview.ts",
    },
    output: {
      path: path.resolve(__dirname, "dist"),
      clean: true,
    },
    resolve: {
      extensions: [".ts", ".js"],
      // Allow the ".ts" extensions in import specifiers that `node --test` needs.
      extensionAlias: { ".ts": [".ts", ".js"] },
    },
    module: {
      rules: [
        {
          test: /\.ts$/,
          exclude: /node_modules/,
          use: {
            loader: "ts-loader",
            // The root tsconfig sets noEmit so `npm run typecheck` and the
            // native type-stripping test runner can share it. Webpack only
            // needs the transpile half; types are checked by that script.
            options: {
              transpileOnly: true,
              // transpileOnly never resolves specifiers, so the ".ts" suffixes
              // the test runner needs pass straight through to webpack, which
              // resolves them via `resolve.extensionAlias` below.
              compilerOptions: { noEmit: false, allowImportingTsExtensions: false },
            },
          },
        },
        { test: /\.(png|jpg|jpeg|gif|ico)$/, type: "asset/resource", generator: { filename: "assets/[name][ext]" } },
      ],
    },
    plugins: [
      new HtmlWebpackPlugin({
        filename: "taskpane.html",
        template: "./src/taskpane/taskpane.html",
        chunks: ["polyfill", "taskpane"],
      }),
      new HtmlWebpackPlugin({
        filename: "commands.html",
        template: "./src/commands/commands.html",
        chunks: ["polyfill", "commands"],
      }),
      new HtmlWebpackPlugin({
        filename: "preview.html",
        template: "./src/preview/preview.html",
        chunks: ["polyfill", "preview"],
      }),
      new CopyWebpackPlugin({
        patterns: [
          { from: "assets/*", to: "assets/[name][ext][query]" },
          { from: "src/taskpane/taskpane.css", to: "taskpane.css" },
          {
            from: "manifest*.xml",
            to: "[name]" + "[ext]",
            transform(content) {
              if (dev) return content;

              if (PROD_ORIGIN === DEV_ORIGIN) {
                // Shipping a manifest that points at localhost produces an
                // add-in that loads for nobody. Fail the build instead.
                throw new Error(
                  "Set ADDIN_BASE_URL to the HTTPS origin hosting dist/ before a production build, " +
                    "e.g. ADDIN_BASE_URL=https://mailflow.example.com npm run build"
                );
              }

              return content.toString().split(DEV_ORIGIN).join(PROD_ORIGIN);
            },
          },
        ],
      }),
    ],
    devServer: {
      headers: { "Access-Control-Allow-Origin": "*" },
      server: { type: "https", options: env.WEBPACK_BUILD || options.https !== undefined ? options.https : await getHttpsOptions() },
      port: 3000,
    },
  };
};
