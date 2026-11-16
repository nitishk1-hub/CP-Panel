// Read directives with their block context; ignore comments and quoted braces.
export function nginxDirectives(text){const rows=[],stack=[];let words=[],word='',quote=null,escape=false,comment=false;
 const flush=()=>{if(word){words.push(word);word='';}};
 for(const ch of text){if(comment){if(ch==='\n')comment=false;continue;}if(escape){word+=ch;escape=false;continue;}if(ch==='\\'){word+=ch;escape=true;continue;}if(quote){if(ch===quote)quote=null;else word+=ch;continue;}if(ch==='"'||ch==="'"){quote=ch;continue;}if(ch==='#'){flush();comment=true;continue;}if(/\s/.test(ch)){flush();continue;}if(ch==='{'){flush();stack.push(words[0]||'block');words=[];continue;}if(ch==='}'){flush();words=[];stack.pop();continue;}if(ch===';'){flush();if(words.length)rows.push({name:words[0],values:words.slice(1),scope:[...stack]});words=[];continue;}word+=ch;
 }return rows;
}
