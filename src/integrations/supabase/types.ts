export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      duel_rooms: {
        Row: {
          created_at: string
          direction: string
          entry_price: number | null
          feed_id: string
          id: string
          leverage: number
          p1_closed: boolean | null
          p1_closed_at: string | null
          p1_direction: string | null
          p1_entry_price: number | null
          p1_feed_id: string | null
          p1_leverage: number | null
          p1_name: string
          p1_pnl: number | null
          p1_rarity: string | null
          p1_stop_loss: number | null
          p1_take_profit: number | null
          p1_ticker: string | null
          p1_wallet: string | null
          p2_closed: boolean | null
          p2_closed_at: string | null
          p2_direction: string | null
          p2_entry_price: number | null
          p2_feed_id: string | null
          p2_leverage: number | null
          p2_name: string | null
          p2_pnl: number | null
          p2_rarity: string | null
          p2_stop_loss: number | null
          p2_take_profit: number | null
          p2_ticker: string | null
          p2_wallet: string | null
          rarity: string
          room_code: string
          started_at: string | null
          status: string
          stop_loss: number
          take_profit: number
          ticker: string
          timer_seconds: number
          winner: string | null
        }
        Insert: {
          created_at?: string
          direction: string
          entry_price?: number | null
          feed_id: string
          id?: string
          leverage: number
          p1_closed?: boolean | null
          p1_closed_at?: string | null
          p1_direction?: string | null
          p1_entry_price?: number | null
          p1_feed_id?: string | null
          p1_leverage?: number | null
          p1_name?: string
          p1_pnl?: number | null
          p1_rarity?: string | null
          p1_stop_loss?: number | null
          p1_take_profit?: number | null
          p1_ticker?: string | null
          p1_wallet?: string | null
          p2_closed?: boolean | null
          p2_closed_at?: string | null
          p2_direction?: string | null
          p2_entry_price?: number | null
          p2_feed_id?: string | null
          p2_leverage?: number | null
          p2_name?: string | null
          p2_pnl?: number | null
          p2_rarity?: string | null
          p2_stop_loss?: number | null
          p2_take_profit?: number | null
          p2_ticker?: string | null
          p2_wallet?: string | null
          rarity?: string
          room_code: string
          started_at?: string | null
          status?: string
          stop_loss: number
          take_profit: number
          ticker: string
          timer_seconds?: number
          winner?: string | null
        }
        Update: {
          created_at?: string
          direction?: string
          entry_price?: number | null
          feed_id?: string
          id?: string
          leverage?: number
          p1_closed?: boolean | null
          p1_closed_at?: string | null
          p1_direction?: string | null
          p1_entry_price?: number | null
          p1_feed_id?: string | null
          p1_leverage?: number | null
          p1_name?: string
          p1_pnl?: number | null
          p1_rarity?: string | null
          p1_stop_loss?: number | null
          p1_take_profit?: number | null
          p1_ticker?: string | null
          p1_wallet?: string | null
          p2_closed?: boolean | null
          p2_closed_at?: string | null
          p2_direction?: string | null
          p2_entry_price?: number | null
          p2_feed_id?: string | null
          p2_leverage?: number | null
          p2_name?: string | null
          p2_pnl?: number | null
          p2_rarity?: string | null
          p2_stop_loss?: number | null
          p2_take_profit?: number | null
          p2_ticker?: string | null
          p2_wallet?: string | null
          rarity?: string
          room_code?: string
          started_at?: string | null
          status?: string
          stop_loss?: number
          take_profit?: number
          ticker?: string
          timer_seconds?: number
          winner?: string | null
        }
        Relationships: []
      }
      leaderboard: {
        Row: {
          created_at: string
          direction: string
          id: string
          leverage: number
          player_name: string
          pnl_percent: number
          rarity: string
          ticker: string
          wallet_address: string | null
        }
        Insert: {
          created_at?: string
          direction: string
          id?: string
          leverage: number
          player_name?: string
          pnl_percent: number
          rarity?: string
          ticker: string
          wallet_address?: string | null
        }
        Update: {
          created_at?: string
          direction?: string
          id?: string
          leverage?: number
          player_name?: string
          pnl_percent?: number
          rarity?: string
          ticker?: string
          wallet_address?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar: string
          avatar_url: string | null
          created_at: string
          display_name: string
          id: string
          wallet_address: string
        }
        Insert: {
          avatar?: string
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          id?: string
          wallet_address: string
        }
        Update: {
          avatar?: string
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          id?: string
          wallet_address?: string
        }
        Relationships: []
      }
      volatile_tokens: {
        Row: {
          feed_id: string
          id: string
          pair: string
          price: number
          ticker: string
          updated_at: string
          volatility: number
        }
        Insert: {
          feed_id: string
          id?: string
          pair: string
          price: number
          ticker: string
          updated_at?: string
          volatility: number
        }
        Update: {
          feed_id?: string
          id?: string
          pair?: string
          price?: number
          ticker?: string
          updated_at?: string
          volatility?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
