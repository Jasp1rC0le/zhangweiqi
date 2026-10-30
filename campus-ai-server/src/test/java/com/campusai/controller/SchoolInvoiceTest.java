package com.campusai.controller;
import com.campusai.mapper.SchoolMapper;
import com.campusai.school.entity.School;
import org.junit.jupiter.api.Test;
import static org.mockito.Mockito.*;
import static org.assertj.core.api.Assertions.*;
class SchoolInvoiceTest {
 @Test void invoiceBelongsOnlyToCorrectActiveSchool(){var mapper=mock(SchoolMapper.class);var school=new School();school.setName("天津中德应用技术大学");when(mapper.findActiveById(7L)).thenReturn(school);var result=new SchoolController(mapper).invoice(7L);assertThat(result.taxId()).isEqualTo("12120000401200249U");assertThat(result.sourceUrl()).isEqualTo("https://cwsj.tsguas.edu.cn/");}
 @Test void unknownOrOtherSchoolCannotReceiveWrongTaxIdentity(){var mapper=mock(SchoolMapper.class);var other=new School();other.setName("其他学校");when(mapper.findActiveById(8L)).thenReturn(other);for(long id:ListHelper.IDS)assertThatThrownBy(()->new SchoolController(mapper).invoice(id)).hasMessageContaining("404");}
 static class ListHelper{static long[] IDS={8,99};}
}
