export const DATA_API_BASE = "https://api.teojabi.com/beta";
// 경매 API 전용(Supabase Edge Function). 경매만 NCP를 거치지 않고 서버리스로 처리한다.
export const AUCTION_API_BASE = "https://tvrfrgozfoiucoeojrta.supabase.co/functions/v1/auction";
// 핵심 데이터 API(runtime·catalog·neighborhoods·activity). NCP 부담을 줄이기 위해 서버리스로 처리.
export const CORE_API_BASE = "https://tvrfrgozfoiucoeojrta.supabase.co/functions/v1/data";
