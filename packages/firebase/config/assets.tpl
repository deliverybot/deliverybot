<% for (var css in htmlWebpackPlugin.files.css) { %><link href="<%= htmlWebpackPlugin.files.css[css] %>" rel="stylesheet"><% } %>
<% for (var chunk in htmlWebpackPlugin.files.js) { %><script src="<%= htmlWebpackPlugin.files.js[chunk] %>"></script><% } %>
