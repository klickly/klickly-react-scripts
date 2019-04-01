'use strict';

// Do this as the first thing so that any code reading it knows the right env.
process.env.BABEL_ENV = 'production';
process.env.NODE_ENV = 'production';

// Makes the script crash on unhandled rejections instead of silently
// ignoring them. In the future, promise rejections that are not handled will
// terminate the Node.js process with a non-zero exit code.
process.on('unhandledRejection', err => {
    throw err;
});

// Ensure environment variables are read.
const getClientEnvironment = require('../config/env');
const env = getClientEnvironment();

const path = require('path');
const chalk = require('chalk');
const fs = require('fs-extra');
const webpack = require('webpack');
const TerserPlugin = require('terser-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const OptimizeCSSAssetsPlugin = require('optimize-css-assets-webpack-plugin');
const safePostCssParser = require('postcss-safe-parser');
const formatWebpackMessages = require('react-dev-utils/formatWebpackMessages');
const FileSizeReporter = require('react-dev-utils/FileSizeReporter');
const printBuildError = require('react-dev-utils/printBuildError');
const printFileSizesAfterBuild = FileSizeReporter.printFileSizesAfterBuild;
const measureFileSizesBeforeBuild = FileSizeReporter.measureFileSizesBeforeBuild;

// These sizes are pretty large. We'll warn for bundles exceeding them.
const WARN_AFTER_BUNDLE_GZIP_SIZE = 512 * 1024;
const WARN_AFTER_CHUNK_GZIP_SIZE = 1024 * 1024;

const appDirectory = fs.realpathSync(process.cwd());
const resolveApp = relativePath => path.resolve(appDirectory, relativePath);

const distPath = resolveApp('build-compile');
// Process CLI arguments
const argv = process.argv.slice(2);

const moduleRules = [
    {
        test: /\.js?$/,
        loader: 'babel-loader',
        exclude: /node_modules/,
        options: {
            babelrc: false,
            configFile: false,
            compact: false,
            "plugins": [
                [
                    "@babel/plugin-proposal-decorators",
                    {
                        "legacy": true
                    }
                ]
            ],
            "presets": [ "react-app" ]
        }
    },
    {
        oneOf: [
            {
                test: /\.scss$/,
                use: [
                    {
                        loader: MiniCssExtractPlugin.loader,
                        options: { publicPath: '../../' }
                    },
                    'css-loader',
                    {
                        loader: 'postcss-loader',
                        options: {
                            ident: 'postcss',
                            plugins: [ require('autoprefixer')() ]
                        }
                    },
                    'sass-loader'
                ]
            }, {
                test: /\.css$/,
                loader: MiniCssExtractPlugin.loader,
                options: { publicPath: '../../' }
            }, {
                test: /\.(jpe?g|png|gif|svg|ico)$/i,
                loader: 'url-loader',
                options: {
                    limit: 20000,
                    name: 'static/media/[name].[hash:8].[ext]'
                }
            }, {
                loader: 'file-loader',
                exclude: [ /\.(js|mjs|jsx|ts|tsx)$/, /\.html$/, /\.json$/ ],
                options: {
                    name: 'static/media/[name].[hash:8].[ext]'
                }
            }
        ]
    }
];

const config = {
    mode: 'production',
    bail: true,
    devtool: false,
    resolve: { extensions: [ '.js' ] },
    entry: { 'index': `./${argv[1]}` },
    output: {
        filename: '[name].bundle.js',
        path: distPath,
        libraryTarget: 'commonjs2',
        pathinfo: false
    },
    optimization: {
        minimize: true,
        minimizer: [
            new TerserPlugin({
                terserOptions: {
                    parse: { ecma: 8, },
                    compress: {
                        ecma: 5,
                        warnings: false,
                        comparisons: false,
                        inline: 2,
                    },
                    mangle: {
                        safari10: true,
                    },
                    output: {
                        ecma: 5,
                        comments: false,
                        ascii_only: true,
                    },
                },
                parallel: true,
                cache: true,
                sourceMap: false
            }),
            new OptimizeCSSAssetsPlugin({
                cssProcessorOptions: {
                    parser: safePostCssParser,
                    map: false
                },
            }),
        ]
    },
    plugins: [
        new webpack.DefinePlugin(env.stringified),
        new MiniCssExtractPlugin({
            filename: 'static/css/[name].bundle.css',
        })
    ],
    module: { rules: moduleRules },
    externals: {
        'react': 'react',
        'axios': 'axios',
        'classnames': 'classnames',
        'lodash': 'lodash',
        'mobx': 'mobx',
        'mobx-react': 'mobx-react',
        'react-dom': 'react-dom',
        'react-slick': 'react-slick',
        'slick-carousel': 'slick-carousel'
    }
};

measureFileSizesBeforeBuild(distPath)
    .then((previousFileSizes) => {
        fs.emptyDirSync(distPath);

        return build(previousFileSizes);
    })
    .then(
    ({ stats, previousFileSizes, warnings }) => {
        if (warnings.length) {
            console.log(chalk.yellow('Compiled with warnings.\n'));
            console.log(warnings.join('\n\n'));
            console.log(
                '\nSearch for the ' +
                chalk.underline(chalk.yellow('keywords')) +
                ' to learn more about each warning.'
            );
            console.log(
                'To ignore, add ' +
                chalk.cyan('// eslint-disable-next-line') +
                ' to the line before.\n'
            );
        } else {
            console.log(chalk.green('Compiled successfully.\n'));
        }

        console.log('File sizes after gzip:\n');
        printFileSizesAfterBuild(
            stats,
            previousFileSizes,
            distPath,
            WARN_AFTER_BUNDLE_GZIP_SIZE,
            WARN_AFTER_CHUNK_GZIP_SIZE
        );
    },
    err => {
        console.log(chalk.red('Failed to compile.\n'));
        printBuildError(err);
        process.exit(1);
    }
)
    .catch(err => {
        if (err && err.message) {
            console.log(err.message);
        }
        process.exit(1);
    });

// Create the production build and print the deployment instructions.
function build(previousFileSizes) {
    console.log('Creating an optimized production build...');

    let compiler = webpack(config);
    return new Promise((resolve, reject) => {
        compiler.run((err, stats) => {
            let messages;
            if (err) {
                if (!err.message) {
                    return reject(err);
                }
                messages = formatWebpackMessages({
                    errors: [err.message],
                    warnings: [],
                });
            } else {
                messages = formatWebpackMessages(
                    stats.toJson({ all: false, warnings: true, errors: true })
                );
            }
            if (messages.errors.length) {
                // Only keep the first error. Others are often indicative
                // of the same problem, but confuse the reader with noise.
                if (messages.errors.length > 1) {
                    messages.errors.length = 1;
                }
                return reject(new Error(messages.errors.join('\n\n')));
            }

            const resolveArgs = {
                stats,
                previousFileSizes,
                warnings: messages.warnings,
            };

            return resolve(resolveArgs);
        });
    });
}

