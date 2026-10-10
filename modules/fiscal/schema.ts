import { z } from "zod";
const text=z.string().trim().max(150);
export const issuerSchema=z.object({
 cnpj:z.string().regex(/^\d{14}$/).or(z.literal("")),legalName:text,ie:text,regime:z.enum(["","1","2","3","4"]),
 accountant:text,reviewed:z.boolean(),presentialApproved:z.boolean(),
}).strict();
export type Issuer=z.infer<typeof issuerSchema>;
export const emptyIssuer:Issuer={cnpj:"",legalName:"",ie:"",regime:"",accountant:"",reviewed:false,presentialApproved:false};
export const taxSchema=z.object({
 ncm:z.string().regex(/^\d{8}$/).or(z.literal("")),cfop:z.string().regex(/^\d{4}$/).or(z.literal("")),
 origin:z.string().regex(/^[0-8]$/).or(z.literal("")),icms:z.string().regex(/^\d{2,3}$/).or(z.literal("")),
 pis:z.string().regex(/^\d{2}$/).or(z.literal("")),cofins:z.string().regex(/^\d{2}$/).or(z.literal("")),
 cest:z.string().regex(/^\d{7}$/).or(z.literal("")),reviewed:z.boolean(),
}).strict();
export type Tax=z.infer<typeof taxSchema>;
export const emptyTax:Tax={ncm:"",cfop:"",origin:"",icms:"",pis:"",cofins:"",cest:"",reviewed:false};
export const fiscalCommand=z.discriminatedUnion("action",[
 z.object({action:z.literal("issuer"),data:issuerSchema}),
 z.object({action:z.literal("product"),productId:z.string().uuid(),data:taxSchema}),
 z.object({action:z.literal("prepare"),orderIds:z.array(z.string().uuid()).min(1).max(50)}),
 z.object({action:z.literal("refresh"),documentId:z.string().uuid()}),
 z.object({action:z.literal("process"),documentId:z.string().uuid()}),
 z.object({action:z.literal("cancel"),documentId:z.string().uuid(),reason:z.string().trim().min(15).max(255)}),
 z.object({action:z.literal("files"),documentId:z.string().uuid()}),
]);
