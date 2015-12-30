import css from 'insert-css-module';

css('._my-module-name_1{text-align:center;white-space:nowrap;vertical-align:middle;cursor:pointer;-webkit-user-select:none;-moz-user-select:none;-ms-user-select:none;user-select:none}._my-module-name_1:hover{color:blue}._my-module-name_2{color:red}');

console.log('<button class="' + '_my-module-name_1' + '"/>');
console.log('<button class="' + '_my-module-name_2 _my-module-name_1' + '"/>');