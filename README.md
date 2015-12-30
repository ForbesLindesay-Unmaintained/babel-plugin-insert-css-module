# babel-plugin-insert-css-module

Inspired by https://github.com/martinandert/babel-plugin-css-in-js

## Usage

```js
import css from 'insert-css-module';

const buttonStyles = css`
  .normal {
    text-align: center;
    white-space: nowrap;
    vertical-align: middle;
    cursor: pointer;
    user-select: none;
  }
  .normal:hover {
    color: blue;
  }
  .danger {
    composes: normal;
    color: red;
  }
`;

console.log('<button class="' + buttonStyles('normal') + '"/>');
console.log('<button class="' + buttonStyles('danger') + '"/>');
```
