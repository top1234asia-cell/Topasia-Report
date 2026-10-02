新增：每行柜量显示整票总柜量，7 个40HQ 每行显示7*40HQ；混合柜型合计显示。每行实际柜型保存在柜型列，可通过栏目显示隐藏。已有订单读取时自动换成合计，点击保存即可保存更新。
此包含前面全部更新。如已部署上一版，只需替换 app/sheet-test/page.tsx 和 app/lib/sheet-test-order.ts。保持目录层级、Volume 及变量。Sites 与 Railway 构建以及柜量、混合柜型、ROT 行数检查通过。
