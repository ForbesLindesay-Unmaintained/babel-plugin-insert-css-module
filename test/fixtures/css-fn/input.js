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
    color: red;
  }
`;

console.log('<button class="' + buttonStyles('normal') + '"/>');
