<% for (var css in htmlWebpackPlugin.files.css) { %><link href="<%= htmlWebpackPlugin.files.css[css] %>" rel="stylesheet"><% } %>
<% for (var chunk in htmlWebpackPlugin.files.chunks) { %><script src="<%= htmlWebpackPlugin.files.chunks[chunk].entry %>"></script><% } %>
