const path = require('path');

module.exports = {
  entry: './src/io-select.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'io-select.js',
    library: {
      name: 'ioSelect',
      type: 'umd',
      export: 'default',
    },
    globalObject: 'this'
  },
  externals: {
    jquery: {
      commonjs: 'jquery',
      commonjs2: 'jquery',
      amd: 'jquery',
      root: 'jQuery'
    }
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env']
          }
        }
      }
    ]
  }
}; 