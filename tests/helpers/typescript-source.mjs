// Node's type stripping leaves Next's extensionless and @/ imports unresolved.
// Used only by direct server-module tests, never by the application runtime.
import {registerHooks} from 'node:module';
import {pathToFileURL} from 'node:url';
registerHooks({resolve(specifier,context,nextResolve){
 const source=specifier.startsWith('@/')?pathToFileURL(process.cwd()+'/'+specifier.slice(2)).href:specifier;
 try{return nextResolve(source,context);}catch(error){
  for(const extension of ['.ts','.tsx','.js']){try{return nextResolve(source+extension,context);}catch{}}
  throw error;
 }
}});
