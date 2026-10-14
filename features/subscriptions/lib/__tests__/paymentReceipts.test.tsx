import React from "react";
import { QueryClient } from "@tanstack/react-query";
import { Text, TouchableOpacity } from "react-native";
import { buildSubscriptionPaymentReceipts } from "../payment-receipts";

let mockRows: Record<string,unknown>[] | null = null;
const mockPush=jest.fn();
const { act, create } = require("react-test-renderer");
jest.mock("expo-router",()=>({useRouter:()=>({push:mockPush})}));
jest.mock("../../../../lib/supabase",()=>({supabase:null}));
jest.mock("@react-native-community/netinfo",()=>({__esModule:true,default:{addEventListener:jest.fn(()=>jest.fn()),fetch:jest.fn(async()=>({isConnected:true,isInternetReachable:true}))}}));
jest.mock("../../../../lib/offline/instance",()=>({offlineRuntime:{listRows:async()=>mockRows}}));
jest.mock("../../../../components/ui/BottomSheet",()=>({BottomSheet:({children}:{children:React.ReactNode})=>{
  const React=require("react");const {View}=require("react-native");return React.createElement(View,null,children);
}}));

import { applyLocalMovementHistoriesToCache } from "../../../../services/queries/offline-snapshot";
import { SubscriptionDetailMovements } from "../../components/SubscriptionDetailMovements";
import { SubscriptionAnalyticsModal } from "../../../../components/domain/SubscriptionAnalyticsModal";

const owner="11111111-1111-1111-1111-111111111111";
const part=(id:number,index:number,extra:Record<string,unknown>={})=>({id,workspace_id:8,created_by_user_id:owner,
  subscription_id:index===1?7:null,category_id:index,counterparty_id:null,movement_type:"expense",status:"posted",
  occurred_at:"2026-10-01T04:59:59.123456Z",source_account_id:20,destination_account_id:null,source_amount:index===1?"12":"8",destination_amount:null,
  metadata:{split_group:"group-a",split_index:index,split_total:2},...extra});
const key=["workspace-snapshot",8,"core"];

describe("split subscription receipt through the actual local cache and UI",()=>{
  afterEach(()=>{mockRows=null;mockPush.mockClear();});
  it("rehydrates one payment for the whole group, without changing balances or category rows",async()=>{
    const queryClient=new QueryClient({defaultOptions:{queries:{gcTime:Infinity}}});
    queryClient.setQueryData(key,{workspaces:[{id:8,baseCurrencyCode:"PEN"}],accounts:[{id:20,currencyCode:"USD",currentBalance:100}],
      categories:[],subscriptions:[],recurringIncome:[],exchangeRates:[{fromCurrencyCode:"USD",toCurrencyCode:"PEN",rate:3.8}],
      counterparties:[],categoryPostedMovements:[],counterpartyPostedMovements:[],subscriptionPostedMovements:[{id:99,subscriptionId:7,sourceAmount:900}],
      catalogHistoryErrors:{subscriptions:"previous failure"}});
    mockRows=[part(1,1),part(2,2)];
    await applyLocalMovementHistoriesToCache(queryClient,8);
    let current=queryClient.getQueryData<Record<string,any>>(key)!;
    expect(current.subscriptionPostedMovements).toHaveLength(1);
    expect(current.subscriptionPostedMovements[0]).toMatchObject({id:1,subscriptionId:7,sourceAmount:20,amountCurrencyCode:"USD",amountInBaseCurrency:76});
    expect(current.categoryPostedMovements.map((row:{sourceAmount:number})=>row.sourceAmount).sort()).toEqual([12,8]);
    expect(current.accounts[0].currentBalance).toBe(100);
    expect(current.catalogHistoryErrors.subscriptions).toBeUndefined();
    let screen:ReturnType<typeof create>;
    act(()=>{screen=create(<SubscriptionDetailMovements subscriptionId={7} currencyCode="PEN" allPostedMovements={current.subscriptionPostedMovements}/>);});
    const texts=()=>screen.root.findAllByType(Text).map((node:any)=>[node.props.children].flat(Infinity).join(""));
    expect(texts()).toContain("Pagos anotados · 1");
    expect(texts().join(" ")).toMatch(/20[.,]00/);
    expect(texts().join(" ")).toContain("2 partes");
    const row=screen.root.findAllByType(TouchableOpacity).find((node:any)=>node.props.onPress);
    act(()=>row.props.onPress());expect(mockPush).toHaveBeenCalledWith("/movement/1?from=subscription");
    mockRows=[part(1,1)];await applyLocalMovementHistoriesToCache(queryClient,8);
    current=queryClient.getQueryData<Record<string,any>>(key)!;
    expect(current.subscriptionPostedMovements).toEqual([]);
    expect(current.catalogHistoryErrors.subscriptions).toMatch(/incompleta/);
    const retry=jest.fn();
    act(()=>screen.update(<SubscriptionDetailMovements subscriptionId={7} currencyCode="PEN" allPostedMovements={current.subscriptionPostedMovements} historyError={current.catalogHistoryErrors.subscriptions} onRetry={retry}/>));
    expect(texts()).toContain("Pagos anotados · sin confirmar");
    expect(texts()).not.toContain("Aún no hay pagos anotados.");
    act(()=>screen.root.findAll((node:any)=>node.props.onPress===retry)[0].props.onPress());expect(retry).toHaveBeenCalledTimes(1);
    mockRows=[part(1,1),part(2,2)];await applyLocalMovementHistoriesToCache(queryClient,8);
    expect(queryClient.getQueryData<Record<string,any>>(key)!.catalogHistoryErrors.subscriptions).toBeUndefined();
    act(()=>screen.unmount());queryClient.clear();
  });
  it("never uses one currency as another without conversion",()=>{
    const rows=[1,2].map((id,index)=>({id,workspaceId:8,createdByUserId:owner,subscriptionId:7,movementType:"expense",status:"posted",occurredAt:"2026-10-01T05:00:00Z",
      sourceAccountId:20,destinationAccountId:null,sourceAmount:index===0?0.1:0.2,destinationAmount:null,metadata:{split_group:"group-a",split_index:index+1,split_total:2}}));
    const result=buildSubscriptionPaymentReceipts(rows,8);
    expect(result.payments[0].sourceAmount).toBe(0.3);expect(result.payments[0].sourceAmountInBaseCurrency).toBeNull();
    expect(rows.map(row=>row.sourceAmount)).toEqual([0.1,0.2]);
  });
  it("hides stale analytical payments on a history failure, without hiding the saved plan",()=>{
    const subscription={id:7,workspaceId:8,name:"Servicio",vendor:"",status:"active" as const,amount:20,currencyCode:"USD",
      frequency:"monthly" as const,frequencyLabel:"Mensual",intervalCount:1,startDate:"2026-01-01",nextDueDate:"2026-10-20",remindDaysBefore:0,autoCreateMovement:false,isPinned:false};
    const retry=jest.fn();let screen:ReturnType<typeof create>;
    act(()=>{screen=create(<SubscriptionAnalyticsModal visible onClose={()=>{}} subscription={subscription}
      movements={[{id:99,subscriptionId:7,occurredAt:"2026-10-01T04:59:59Z",sourceAmount:900,destinationAmount:null,amountCurrencyCode:"USD",amountInBaseCurrency:3420}]}
      baseCurrencyCode="PEN" historyError="División incompleta" onRetry={retry}/>);});
    const texts=screen.root.findAllByType(Text).map((node:any)=>[node.props.children].flat(Infinity).join(""));
    expect(texts).toContain("Historial sin confirmar");expect(texts).toContain("Lo que cuesta");
    expect(texts).not.toContain("Último pago");expect(texts.join(" ")).not.toMatch(/900[.,]00|3[,.]420/);
    act(()=>screen.root.findAll((node:any)=>node.props.onPress===retry)[0].props.onPress());expect(retry).toHaveBeenCalledTimes(1);
    act(()=>screen.unmount());
  });
});
