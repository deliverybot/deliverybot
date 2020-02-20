const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");

module.exports = {
  entry: "./lib/client/entrypoint.js",
  devtool: "source-map",
  mode: "production",
  output: {
    publicPath: "/static/bundle/",
    path: path.resolve(__dirname, "..", "public", "static", "bundle"),
    filename: "[name].[contenthash].js",
  },
  plugins: [
    new MiniCssExtractPlugin({
      filename: '[name].[contenthash].css',
      chunkFilename: '[id].[contenthash].css',
    }),
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
  performance: {
    hints: false,
  },
  module: {
    rules: [
      {
        test: /\.css$/i,
        use: [MiniCssExtractPlugin.loader, "css-loader"],
      },
    ],
  },
};
