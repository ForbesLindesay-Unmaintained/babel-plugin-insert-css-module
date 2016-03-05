import assert from 'assert';
import {readdirSync, readFileSync, writeFileSync} from 'fs';
import {transform} from 'babel-core';
import test from 'testit';
import cssPlugin from '../src';

function checkExpected(actual, filename) {
  let expected;
  try {
    expected = readFileSync(filename, 'utf8');
  } catch (ex) {
    if (ex.code !== 'ENOENT') throw ex;
    expected = actual;
    writeFileSync(filename, expected);
  }
  assert.equal(actual.trim().replace(/\n+/g, '\n'), expected.trim().replace(/\n+/g, '\n'));
}

// cssInJS, {vendorPrefixes: true, bundleFile: 'test/bundle.css', compressClassNames: true}
test('un-optimised (keeps full length class names)', () => {
  readdirSync(__dirname + '/fixtures').forEach((folder) => {
    test(folder, () => {
      const input = readFileSync(__dirname + '/fixtures/' + folder + '/input.js', 'utf8');
      test('un-extracted (use this in libraries)', () => {
        // normal un-optimised, un-extracted (use this in libraries)
        const output = transform(input, {
          filename: __dirname + '/fixtures/' + folder + '/input.js',
          plugins: [[cssPlugin]],
          babelrc: false,
        }).code;
        writeFileSync(__dirname + '/fixtures/' + folder + '/output.js', output);
        checkExpected(output, __dirname + '/fixtures/' + folder + '/expected.js');
      });

      test('extracted (use this in dev-mode in applications)', () => {
        const outputExtracted = transform(input, {
          filename: __dirname + '/fixtures/' + folder + '/input.js',
          plugins: [[cssPlugin, {extractCSS: __dirname + '/bundle.css'}]],
          babelrc: false,
        }).code;
        writeFileSync(__dirname + '/fixtures/' + folder + '/output.extracted.js', outputExtracted);
        checkExpected(outputExtracted, __dirname + '/fixtures/' + folder + '/expected.extracted.js');
      });

      test(
        'extracted (this checks that the result of a lib can still have its css extracted)',
        () => {
          const output = readFileSync(__dirname + '/fixtures/' + folder + '/expected.js', 'utf8');
          // normal un-optimised, extracted (use this checks that the result of a lib can still have its css extracted)
          const outputExtractedLate = transform(output, {
            filename: __dirname + '/fixtures/' + folder + '/input.js',
            plugins: [[cssPlugin, {extractCSS: __dirname + '/bundle.css'}]],
            babelrc: false,
          }).code;
          writeFileSync(__dirname + '/fixtures/' + folder + '/output.extracted.js', outputExtractedLate);
          checkExpected(outputExtractedLate, __dirname + '/fixtures/' + folder + '/expected.extracted.js');
        }
      );
    });
  });
});
test('optimised (minifies class names)', () => {
  readdirSync(__dirname + '/fixtures').forEach((folder) => {
    test(folder, () => {
      const input = readFileSync(__dirname + '/fixtures/' + folder + '/input.js', 'utf8');
      test('un-extracted (use this in libraries)', () => {
        const output = transform(input, {
          filename: __dirname + '/fixtures/' + folder + '/input.js',
          plugins: [[cssPlugin, {optimised: 'my-module-name', cache: __dirname + '/.cls-name-cache.json'}]],
          babelrc: false,
        }).code;
        writeFileSync(__dirname + '/fixtures/' + folder + '/output.optimised.js', output);
        checkExpected(output, __dirname + '/fixtures/' + folder + '/expected.optimised.js');
      });
      test('extracted (use this in applications)', () => {
        const output = transform(input, {
          filename: __dirname + '/fixtures/' + folder + '/input.js',
          plugins: [
            [
              cssPlugin,
              {
                extractCSS: __dirname + '/bundle.min.css',
                optimised: true,
                cache: __dirname + '/.cls-name-cache.json',
              },
            ],
          ],
          babelrc: false,
        }).code;
        writeFileSync(__dirname + '/fixtures/' + folder + '/output.optimised.extracted.js', output);
        checkExpected(output, __dirname + '/fixtures/' + folder + '/expected.optimised.extracted.js');
      });
    });
  });
});
