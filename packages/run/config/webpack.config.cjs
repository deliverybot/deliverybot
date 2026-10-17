const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");

module.exports = {
  entry: "./lib/client.js",
  devtool: "source-map",
  mode: "production",
  // Rebuilds only what changed since the last build. The cache lives in
  // node_modules/.cache/webpack.
  cache: { type: "filesystem", buildDependencies: { config: [__filename] } },
  output: {
    publicPath: "/static/bundle/",
    path: path.resolve(__dirname, "..", "bundle"),
    filename: "[name].[contenthash].js",
  },
  plugins: [
    // Hash the stylesheet name like the script, so a deploy never serves
    // new markup with a cached old stylesheet.
    new MiniCssExtractPlugin({ filename: "[name].[contenthash].css" }),
    new HtmlWebpackPlugin({
      inject: false,
      minify: true,
      filename: "scripts.html",
      template: "./config/assets.tpl",
    }),
  ],
  optimization: {
    splitChunks: {},
  },
  resolve: {
    // Templates are precompiled, so the browser only needs the runtime.
    alias: { handlebars$: "handlebars/runtime" },
  },
  performance: {
    hints: false,
  },
  module: {
    rules: [
      {
        test: /\.css$/i,
        use: [
          MiniCssExtractPlugin.loader,
          {
            loader: "css-loader",
            // Root-relative URLs (/fonts, /images) are served as-is.
            options: { url: { filter: url => !url.startsWith("/") } },
          },
        ],
      },
    ],
  },
};
